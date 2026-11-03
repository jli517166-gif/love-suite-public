<#
  打包一个可以直接发给别人的发布包（不需要 clone 仓库）。

  生成：dist\love-suite-<版本>.zip
  里面：plugin/、install.ps1、skills/、README.md、CONFIG.md、INSTALL_PROMPT.md

  对方解压后：
    powershell -ExecutionPolicy Bypass -File .\install.ps1 -DryRun
    powershell -ExecutionPolicy Bypass -File .\install.ps1 -OwnerQQ <号>
#>
param(
    [string]$OutDir = "$PSScriptRoot\dist"
)

$ErrorActionPreference = "Stop"
$pkg = Get-Content (Join-Path $PSScriptRoot "plugin\package.json") -Raw -Encoding utf8 | ConvertFrom-Json
$version = $pkg.version
$stage = Join-Path $OutDir "love-suite-$version"

if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Force $stage | Out-Null

$items = @("plugin", "skills", "install.ps1", "README.md", "MANUAL.md", "CONFIG.md", "INSTALL_PROMPT.md")
foreach ($item in $items) {
    $src = Join-Path $PSScriptRoot $item
    if (Test-Path $src) {
        Copy-Item $src (Join-Path $stage $item) -Recurse -Force
    }
}

# 去掉开发用的备份 / 临时文件
Get-ChildItem $stage -Recurse -File -Include "*.bak-*", "*.tmp" -ErrorAction SilentlyContinue | Remove-Item -Force

$zip = Join-Path $OutDir "love-suite-$version.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $stage "*") -DestinationPath $zip
$size = [math]::Round((Get-Item $zip).Length / 1MB, 2)
Write-Host "已生成：$zip（$size MB，版本 $version）"
Write-Host "对方解压后运行：powershell -ExecutionPolicy Bypass -File .\install.ps1 -DryRun"
