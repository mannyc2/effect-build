param(
  [Parameter(Mandatory = $true)]
  [string] $Destination
)

$ErrorActionPreference = "Stop"
$asset = "nfpm_2.47.0_Windows_x86_64.zip"
$url = "https://github.com/goreleaser/nfpm/releases/download/v2.47.0/$asset"
$expected = "788f88a3bba0d89baa639aba54ba28b384958878700d440ce199a7ff4a567f11"
$staging = Join-Path ([System.IO.Path]::GetTempPath()) ("effect-build-nfpm-" + [guid]::NewGuid())
try {
  New-Item -ItemType Directory -Path $staging | Out-Null
  New-Item -ItemType Directory -Force -Path $Destination | Out-Null
  $archive = Join-Path $staging $asset
  Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $archive
  $observed = (Get-FileHash -Algorithm SHA256 -LiteralPath $archive).Hash.ToLowerInvariant()
  if ($observed -ne $expected) {
    throw "nFPM checksum mismatch: expected $expected, observed $observed"
  }
  Expand-Archive -LiteralPath $archive -DestinationPath $staging
  $source = Join-Path $staging "nfpm.exe"
  if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
    throw "the pinned nFPM archive did not contain nfpm.exe"
  }
  $target = Join-Path $Destination "nfpm.exe"
  Copy-Item -LiteralPath $source -Destination $target
  Write-Output $target
} finally {
  Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction SilentlyContinue
}
