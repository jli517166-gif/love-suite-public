<#
  手动发布 dsh-memory-network 和 dsh-love-semantic 到 npm。

  用法：
    powershell -ExecutionPolicy Bypass -File .\scripts\publish-npm.ps1 -DryRun
    powershell -ExecutionPolicy Bypass -File .\scripts\publish-npm.ps1

  发布时 npm 会打开浏览器，需要你插入/触碰 security key，或输入 authenticator 的 6 位码。
#>
param(
    [switch]$DryRun,
    [switch]$SkipSemantic
)

$ErrorActionPreference = "Stop"
$repo = Split-Path $PSScriptRoot -Parent
$npmCmd = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
if (-not $npmCmd) { $npmCmd = "D:\App\node\npm.cmd" }
$npm = $npmCmd

function Run-Step([string]$label, [string]$workdir, [string[]]$arguments) {
    Write-Host ""
    Write-Host "== $label" -ForegroundColor Cyan
    Write-Host ("   cd " + $workdir)
    Write-Host ("   " + $npm + " " + ($arguments -join " "))
    if ($DryRun) { return }
    Push-Location $workdir
    try {
        & $npm @arguments
        if ($LASTEXITCODE -ne 0) { throw "$label 失败（退出码 $LASTEXITCODE）" }
    } finally {
        Pop-Location
    }
}

Write-Host "仓库：$repo"
if (-not $DryRun) {
    $who = & $npm whoami 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $who) {
        throw "还没登录 npm。先运行：npm login --auth-type=web"
    }
    Write-Host "当前 npm 账号：$who"
}

$mainVersion = (Get-Content (Join-Path $repo "package.json") -Raw | ConvertFrom-Json).version
$semanticVersion = (Get-Content (Join-Path $repo "semantic-plugin\package.json") -Raw | ConvertFrom-Json).version
Write-Host "主插件版本：$mainVersion"
Write-Host "语义插件版本：$semanticVersion"

Run-Step "发布 dsh-memory-network@$mainVersion" $repo @("publish", "--access", "public")

if (-not $SkipSemantic) {
    Run-Step "发布 dsh-love-semantic@$semanticVersion" (Join-Path $repo "semantic-plugin") @("publish", "--access", "public")
}

if ($DryRun) {
    Write-Host ""
    Write-Host "这是 DryRun，没有真正发布。"
} else {
    Write-Host ""
    Write-Host "发布完成。检查：npm view dsh-memory-network version" -ForegroundColor Green
}
