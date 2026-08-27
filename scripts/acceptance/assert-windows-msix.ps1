param(
  [Parameter(Mandatory = $true)]
  [string] $Unsigned,
  [Parameter(Mandatory = $true)]
  [string] $Signed,
  [Parameter(Mandatory = $true)]
  [string] $MakeAppx,
  [Parameter(Mandatory = $true)]
  [string] $SignTool,
  [Parameter(Mandatory = $true)]
  [string] $CertificateThumbprint
)

$ErrorActionPreference = "Stop"
foreach ($path in @($Unsigned, $Signed, $MakeAppx, $SignTool)) {
  if (-not [System.IO.Path]::IsPathRooted($path) -or -not (Test-Path -LiteralPath $path -PathType Leaf)) {
    throw "required file is missing or non-absolute: $path"
  }
}

$unpacked = Join-Path ([System.IO.Path]::GetTempPath()) ("effect-build-msix-" + [guid]::NewGuid())
$signedUnpacked = Join-Path ([System.IO.Path]::GetTempPath()) ("effect-build-msix-signed-" + [guid]::NewGuid())
$installed = $null
try {
  $archive = [System.IO.Compression.ZipFile]::OpenRead($Unsigned)
  try {
    $expectedArchiveFiles = @(
      "[Content_Types].xml",
      "AppxBlockMap.xml",
      "AppxManifest.xml",
      "Assets/logo.png",
      "Assets/logo150.png",
      "Assets/logo44.png",
      "effect-build-acceptance.exe"
    ) | Sort-Object
    $archiveFiles = @($archive.Entries | Where-Object { $_.Name.Length -ne 0 } | ForEach-Object {
      $_.FullName.Replace("\\", "/")
    }) | Sort-Object
    $archiveDifference = @(
      Compare-Object -CaseSensitive -ReferenceObject $expectedArchiveFiles -DifferenceObject $archiveFiles
    )
    if ($archiveDifference.Count -ne 0) {
      throw "unexpected exact unsigned MSIX archive file set: $($archiveDifference | Out-String)"
    }
  } finally {
    $archive.Dispose()
  }

  & $MakeAppx unpack /p $Unsigned /d $unpacked /o
  if ($LASTEXITCODE -ne 0) { throw "MakeAppx failed to unpack the unsigned MSIX" }
  [xml] $manifest = Get-Content -LiteralPath (Join-Path $unpacked "AppxManifest.xml")
  [xml] $blockMap = Get-Content -LiteralPath (Join-Path $unpacked "AppxBlockMap.xml")
  if (Test-Path -LiteralPath (Join-Path $unpacked "AppxSignature.p7x")) {
    throw "the nFPM construction result was unexpectedly signed before the explicit SignTool boundary"
  }
  if ($manifest.Package.Identity.Name -ne "effect-build-acceptance") { throw "unexpected MSIX identity name" }
  if ($manifest.Package.Identity.Version -ne "1.2.3.0") { throw "unexpected MSIX identity version" }
  if ($manifest.Package.Identity.Publisher -ne "CN=Effect Build Acceptance") { throw "unexpected MSIX publisher" }
  if ($manifest.Package.Identity.ProcessorArchitecture -ne "x64") { throw "unexpected MSIX architecture" }
  if ($blockMap.BlockMap.HashMethod -ne "http://www.w3.org/2001/04/xmlenc#sha256") {
    throw "unexpected MSIX block-map digest algorithm"
  }
  $expectedFiles = @(
    "AppxBlockMap.xml",
    "AppxManifest.xml",
    "Assets/logo.png",
    "Assets/logo150.png",
    "Assets/logo44.png",
    "effect-build-acceptance.exe"
  ) | Sort-Object
  $observedFiles = @(Get-ChildItem -LiteralPath $unpacked -File -Recurse | ForEach-Object {
    [System.IO.Path]::GetRelativePath($unpacked, $_.FullName).Replace("\", "/")
  }) | Sort-Object
  $fileDifference = @(Compare-Object -CaseSensitive -ReferenceObject $expectedFiles -DifferenceObject $observedFiles)
  if ($fileDifference.Count -ne 0) {
    throw "unexpected exact MSIX file set: $($fileDifference | Out-String)"
  }
  $expectedBlockMapFiles = @(
    "AppxManifest.xml",
    "Assets\logo.png",
    "Assets\logo150.png",
    "Assets\logo44.png",
    "effect-build-acceptance.exe"
  ) | Sort-Object
  $blockMapFiles = @($blockMap.BlockMap.File | ForEach-Object { [string] $_.Name }) | Sort-Object
  $blockMapDifference = @(
    Compare-Object -CaseSensitive -ReferenceObject $expectedBlockMapFiles -DifferenceObject $blockMapFiles
  )
  if ($blockMapDifference.Count -ne 0) {
    throw "unexpected exact MSIX block-map file set: $($blockMapDifference | Out-String)"
  }
  $sha256 = [System.Security.Cryptography.SHA256]::Create()
  try {
    foreach ($file in @($blockMap.BlockMap.File)) {
      $payload = Join-Path $unpacked ([string] $file.Name)
      $bytes = [System.IO.File]::ReadAllBytes($payload)
      if ([int64] $file.Size -ne $bytes.LongLength) { throw "block-map size mismatch for $($file.Name)" }
      $blocks = @($file.Block)
      $expectedBlockCount = [Math]::Ceiling($bytes.LongLength / 65536.0)
      if ($blocks.Count -ne $expectedBlockCount) { throw "block-map block count mismatch for $($file.Name)" }
      for ($index = 0; $index -lt $blocks.Count; $index++) {
        $offset = $index * 65536
        $count = [Math]::Min(65536, $bytes.Length - $offset)
        $observedHash = [Convert]::ToBase64String($sha256.ComputeHash($bytes, $offset, $count))
        if ($observedHash -cne [string] $blocks[$index].Hash) {
          throw "block-map SHA-256 mismatch for $($file.Name) block $index"
        }
      }
    }
  } finally {
    $sha256.Dispose()
  }
  $targetFamily = $manifest.Package.Dependencies.TargetDeviceFamily
  if (
    $targetFamily.Name -ne "Windows.Desktop" -or
    $targetFamily.MinVersion -ne "10.0.17763.0" -or
    $targetFamily.MaxVersionTested -ne "10.0.26100.0"
  ) { throw "unexpected MSIX target device family" }
  $application = $manifest.Package.Applications.Application
  if ($application.Executable -ne "effect-build-acceptance.exe") { throw "unexpected MSIX application executable" }
  if ($application.EntryPoint -ne "Windows.FullTrustApplication") { throw "unexpected MSIX application entry point" }
  $fullTrust = @($manifest.GetElementsByTagName("rescap:Capability")) |
    Where-Object { $_.GetAttribute("Name") -eq "runFullTrust" }
  if ($fullTrust.Count -ne 1) { throw "the MSIX must declare exactly one runFullTrust capability" }

  & $MakeAppx unpack /p $Signed /d $signedUnpacked /o
  if ($LASTEXITCODE -ne 0) { throw "MakeAppx failed to unpack the signed MSIX" }
  if (-not (Test-Path -LiteralPath (Join-Path $signedUnpacked "AppxSignature.p7x") -PathType Leaf)) {
    throw "the signed MSIX did not contain AppxSignature.p7x"
  }
  foreach ($relative in @(
    "AppxBlockMap.xml",
    "AppxManifest.xml",
    "effect-build-acceptance.exe",
    "Assets\logo.png",
    "Assets\logo150.png",
    "Assets\logo44.png"
  )) {
    $unsignedHash = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $unpacked $relative)).Hash
    $signedHash = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $signedUnpacked $relative)).Hash
    if ($unsignedHash -cne $signedHash) { throw "signing changed verified payload bytes: $relative" }
  }

  $verification = & $SignTool verify /pa /all /v $Signed 2>&1
  if ($LASTEXITCODE -ne 0) { throw "SignTool /pa verification failed: $($verification -join [Environment]::NewLine)" }
  $verificationText = $verification -join [Environment]::NewLine
  if ($verificationText -notmatch "Successfully verified") { throw "SignTool did not report successful verification" }
  if ($verificationText -notmatch "timestamp") { throw "SignTool did not report an RFC 3161 timestamp" }
  $signature = Get-AuthenticodeSignature -FilePath $Signed
  if ($signature.Status -ne "Valid") { throw "Get-AuthenticodeSignature reported $($signature.Status)" }
  if ($signature.SignerCertificate.Thumbprint.ToLowerInvariant() -ne $CertificateThumbprint.ToLowerInvariant()) {
    throw "the MSIX signer thumbprint did not match the process-local test certificate"
  }
  if ($null -eq $signature.TimeStamperCertificate) { throw "the signed MSIX has no timestamp certificate" }

  Add-AppxPackage -Path $Signed
  $installed = Get-AppxPackage -Name $manifest.Package.Identity.Name
  if ($null -eq $installed) { throw "the signed MSIX was not visible after Add-AppxPackage" }
  $installedExecutable = Join-Path $installed.InstallLocation $application.Executable
  $output = & $installedExecutable
  if (($output -join "`n").Trim() -ne "effect-build-msix-ok") { throw "the installed executable smoke test failed" }
} finally {
  if ($null -ne $installed) {
    Remove-AppxPackage -Package $installed.PackageFullName -ErrorAction SilentlyContinue
  }
  Remove-Item -LiteralPath $unpacked -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $signedUnpacked -Recurse -Force -ErrorAction SilentlyContinue
}
