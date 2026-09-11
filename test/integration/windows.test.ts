import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { Artifact } from "effect-build";
import * as Bun from "effect-build-bun";
import * as Windows from "effect-build-windows";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";

const execute = promisify(execFile);
const run = <A, E>(effect: Effect.Effect<A, E, NodeServices.NodeServices>) =>
  Effect.runPromise(effect.pipe(Effect.provide(NodeServices.layer)));
const timestampUrl = "http://timestamp.digicert.com";
const removeCertificate = String.raw`
function Remove-TestCertificate([string] $thumbprint) {
  if ($thumbprint -notmatch '^[A-Fa-f0-9]{40}$') { throw 'Invalid test certificate thumbprint' }
  try {
    $trusted = "Cert:\LocalMachine\Root\$thumbprint"
    if (Test-Path $trusted) { Remove-Item $trusted -Confirm:$false }
  } finally {
    $personal = "Cert:\CurrentUser\My\$thumbprint"
    if (Test-Path $personal) { Remove-Item $personal -DeleteKey -Confirm:$false }
  }
}
`;

it.skipIf(process.platform !== "win32")("signs and timestamps a compiled executable with the real Windows SDK", async () => {
  // Bun's Windows extraction cache and outputs must stay on the checkout volume.
  const root = await mkdtemp(join(process.cwd(), ".effect-build-signing-"));
  // Node does not translate pwsh's module paths when it starts Windows PowerShell.
  const powershellEnv = Object.fromEntries(Object.entries(process.env).filter(([name]) => name.toLowerCase() !== "psmodulepath"));
  const powershell = (script: string, env: Readonly<Record<string, string>> = {}) => execute("powershell.exe", [
    "-NoLogo", "-NoProfile", "-NonInteractive", "-Command", String.raw`$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Security\Microsoft.PowerShell.Security.psd1')
${removeCertificate}
${script}`,
  ], { env: { ...powershellEnv, EFFECT_BUILD_SIGN_TEST_ROOT: root, ...env }, timeout: 60_000 });
  try {
    const tool = process.env.EFFECT_BUILD_SIGNTOOL ?? (await powershell(String.raw`
$kits = [Environment]::GetEnvironmentVariable('ProgramFiles(x86)')
$tool = Get-ChildItem (Join-Path $kits 'Windows Kits\10\bin\*\x64\signtool.exe') |
  Sort-Object { [version] $_.Directory.Parent.Name } -Descending | Select-Object -First 1
if (-not $tool) { throw 'Install Windows SDK signing tools or set EFFECT_BUILD_SIGNTOOL' }
$tool.FullName
`)).stdout.trim();
    // Capture the actual SDK help banner before the layer applies its version probe.
    const help = await new Promise<string>((resolve) => {
      execFile(tool, ["/?"], { timeout: 30_000 }, (error, stdout, stderr) => {
        resolve(`${stdout}${stderr}${error === null ? "" : String(error)}`);
      });
    });
    const version = (await powershell("[Diagnostics.FileVersionInfo]::GetVersionInfo($env:EFFECT_BUILD_SIGN_TEST_TOOL).ProductVersion", {
      EFFECT_BUILD_SIGN_TEST_TOOL: tool,
    })).stdout.trim();
    await run(Effect.log(`SignTool ${tool} (${version})\n${help}`));
    await powershell(String.raw`
$principal = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Run the Windows signing integration test from an elevated administrator shell' }
$certificate = New-SelfSignedCertificate -Type CodeSigningCert -Subject 'CN=effect-build integration test' -CertStoreLocation 'Cert:\CurrentUser\My' -KeyAlgorithm RSA -KeyLength 2048 -HashAlgorithm SHA256 -NotAfter (Get-Date).AddDays(1)
try {
  [IO.File]::WriteAllText((Join-Path $env:EFFECT_BUILD_SIGN_TEST_ROOT 'thumbprint'), $certificate.Thumbprint)
  $public = Join-Path $env:EFFECT_BUILD_SIGN_TEST_ROOT 'certificate.cer'
  Export-Certificate -Cert $certificate -FilePath $public | Out-Null
  # CurrentUser root trust requires UI; the disposable administrator runner can import machine trust without it.
  Import-Certificate -FilePath $public -CertStoreLocation 'Cert:\LocalMachine\Root' -Confirm:$false | Out-Null
} catch {
  Remove-TestCertificate $certificate.Thumbprint
  throw
}
`);
    const thumbprint = await readFile(join(root, "thumbprint"), "utf8");
    const entrypoint = join(root, "hello.ts");
    await writeFile(entrypoint, 'console.log("signed hello");\n');
    const bun = process.env.EFFECT_BUILD_BUN;
    const original = await run(Bun.compile({ entrypoints: [entrypoint], outfile: join(root, "unsigned.exe") }).pipe(
      Effect.provide(Bun.layer(bun === undefined ? {} : { executable: bun })),
    ));
    const signed = await run(Windows.sign({
      artifact: original, outfile: join(root, "signed.exe"), kind: "store", thumbprint, timestampUrl,
    }).pipe(Effect.provide(Windows.layer({ executable: tool })), Effect.timeout("120 seconds")));
    expect(signed.kind).toBe("executable");
    expect(signed.target).toBe(original.target);
    expect(signed.format).toBe("pe");
    expect(signed.producedBy.version).toBe(version);
    expect(signed.sha256).not.toBe(original.sha256);
    expect(signed.signature).toMatchObject({ fileDigest: "SHA256", timestampDigest: "SHA256", timestampProtocol: "RFC3161", verification: "Authenticode" });
    expect(await run(Artifact.verify(original))).toEqual(original);
    expect(await run(Artifact.verify(signed))).toEqual(signed);
    await execute(tool, ["verify", "/pa", "/all", "/tw", signed.path], { timeout: 60_000 });
    expect((await execute(signed.path, [], { timeout: 30_000 })).stdout.trim()).toBe("signed hello");
  } finally {
    try {
      await powershell(String.raw`
$record = Join-Path $env:EFFECT_BUILD_SIGN_TEST_ROOT 'thumbprint'
if (Test-Path $record) { Remove-TestCertificate ([IO.File]::ReadAllText($record)) }
`);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
}, 300_000);
