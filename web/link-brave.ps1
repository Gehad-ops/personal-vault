param(
    [Parameter(Mandatory = $true)]
    [string]$ExtensionId
)

$ErrorActionPreference = "Stop"
$manifest = Join-Path $env:LOCALAPPDATA "KeePassXC\org.keepassxc.keepassxc_browser_chrome.json"

if (-not (Test-Path $manifest)) {
    Write-Error "Native host manifest not found at $manifest. Open PersonalVault and unlock the vault first so it registers the host."
    exit 1
}

$data = Get-Content $manifest -Raw | ConvertFrom-Json
$origin = "chrome-extension://$ExtensionId/"
$origins = @($data.allowed_origins)
if ($origins -notcontains $origin) {
    $origins += $origin
}
$data.allowed_origins = $origins
$data | ConvertTo-Json -Depth 10 | Set-Content -Path $manifest -Encoding UTF8

$keys = @(
    "HKCU:\Software\Google\Chrome\NativeMessagingHosts\org.keepassxc.keepassxc_browser",
    "HKCU:\Software\Chromium\NativeMessagingHosts\org.keepassxc.keepassxc_browser",
    "HKCU:\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\org.keepassxc.keepassxc_browser",
    "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\org.keepassxc.keepassxc_browser",
    "HKCU:\Software\Vivaldi\NativeMessagingHosts\org.keepassxc.keepassxc_browser"
)

foreach ($key in $keys) {
    New-Item -Path $key -Force | Out-Null
    Set-ItemProperty -Path $key -Name "(Default)" -Value $manifest
}

Write-Host "Linked $origin"
Write-Host "Restart the browser, keep PersonalVault open and unlocked, then click the extension icon."
