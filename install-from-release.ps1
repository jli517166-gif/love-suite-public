param(
  [string]$Version = "latest",
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$repo = "jli517166-gif/love-suite-public"
if ($Version -eq "latest") {
  $base = "https://github.com/$repo/releases/latest/download"
} else {
  $base = "https://github.com/$repo/releases/download/v$Version"
}

$work = Join-Path $env:TEMP ("love-suite-install-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $work | Out-Null
$zip = Join-Path $work "love-suite-source.zip"
$sumsFile = Join-Path $work "SHA256SUMS.txt"

Write-Host "下载 release：$base"
Invoke-WebRequest "$base/love-suite-source.zip" -OutFile $zip
Invoke-WebRequest "$base/SHA256SUMS.txt" -OutFile $sumsFile

$line = Get-Content $sumsFile | Where-Object { $_ -match "love-suite-source\.zip" } | Select-Object -First 1
if (-not $line) { throw "SHA256SUMS.txt 里没有 love-suite-source.zip" }
$expected = ($line -split "\s+")[0].ToLower()
$actual = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLower()
if ($actual -ne $expected) { throw "校验失败：期望 $expected，实际 $actual" }
Write-Host "校验通过：$actual"

$dir = Join-Path $work "src"
Expand-Archive -Path $zip -DestinationPath $dir -Force
$install = Join-Path $dir "install.ps1"
if (-not (Test-Path $install)) { throw "压缩包里没有 install.ps1" }

if ($DryRun) {
  & powershell -NoProfile -ExecutionPolicy Bypass -File $install -DryRun
} else {
  & powershell -NoProfile -ExecutionPolicy Bypass -File $install
}
