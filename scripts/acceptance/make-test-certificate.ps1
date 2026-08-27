param(
  [Parameter(Mandatory = $true)]
  [string] $OutFile,
  [Parameter(Mandatory = $true)]
  [string] $Password
)

$ErrorActionPreference = "Stop"
$securePassword = ConvertTo-SecureString -String $Password -AsPlainText -Force
$certificate = New-SelfSignedCertificate `
  -Type Custom `
  -Subject "CN=Effect Build Acceptance" `
  -FriendlyName "effect-build acceptance mechanics only" `
  -CertStoreLocation "Cert:\CurrentUser\My" `
  -KeyAlgorithm RSA `
  -KeyLength 2048 `
  -HashAlgorithm SHA256 `
  -KeyExportPolicy Exportable `
  -KeyUsage DigitalSignature `
  -TextExtension @("2.5.29.37={text}1.3.6.1.5.5.7.3.3") `
  -NotAfter (Get-Date).AddDays(2)
Export-PfxCertificate -Cert $certificate -FilePath $OutFile -Password $securePassword | Out-Null
$cer = [System.IO.Path]::ChangeExtension($OutFile, ".cer")
Export-Certificate -Cert $certificate -FilePath $cer | Out-Null
# App package deployment validates self-signed development identities against the
# local machine's Trusted People store, even when the current user invokes it.
Import-Certificate -FilePath $cer -CertStoreLocation "Cert:\LocalMachine\TrustedPeople" | Out-Null
Write-Output ($certificate.Thumbprint.ToLowerInvariant())
