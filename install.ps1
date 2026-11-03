<#
  一键安装 / 修复 dsh-memory-network

  做四件事：
    1. 把插件登记进 DSH profile（dependencies + bundles）
    2. 需要时跑 pnpm 安装（meow-memory / dsh-onebot-qq / 本插件）
    3. 配 NapCat 的 OneBot 反向 WS（可选再开 HTTP 直发）
    4. 写运行时配置（工作区、QQ 号、端口、token）

  用法：
    powershell -ExecutionPolicy Bypass -File .\install.ps1 -DryRun     # 只体检、不动文件
    powershell -ExecutionPolicy Bypass -File .\install.ps1              # 真装
    可选：-Workspace <路径> -BotQQ <号> -OwnerQQ <号> -HttpPort 6700

  注意：会先备份被改的 package.json / onebot11 配置。
#>
param(
    [string]$Profile = "$env:USERPROFILE\.dsh\profiles\desktop",
    [string]$Workspace = "",
    [string]$BotQQ = "",
    [string]$OwnerQQ = "",
    [int]$QqPort = 8643,
    [int]$HttpPort = 0,
    [string]$NapcatDir = "",
    [string]$DshRoot = "E:\App\deepseek harness",
    [string]$Token = "",
    [switch]$DryRun,
    [switch]$SkipDeps,
    [switch]$SkipNapCat
)

$ErrorActionPreference = "Stop"
$repo = $PSScriptRoot
$pluginDir = Join-Path $repo "plugin"
$script:actions = 0

function Step([string]$text) { Write-Host "`n== $text" -ForegroundColor Cyan }
function Info([string]$text) { Write-Host "   $text" }
function Act([string]$text) {
    $script:actions++
    if ($DryRun) { Write-Host "   [dry-run] $text" -ForegroundColor Yellow }
    else { Write-Host "   $text" }
}
function Backup-File([string]$path) {
    if (-not (Test-Path $path)) { return }
    $bak = "$path.bak-install-" + (Get-Date -Format "yyyyMMdd-HHmmss")
    Copy-Item $path $bak -Force
    Info "备份: $bak"
}
function Write-Utf8Json([string]$path, $data) {
    $json = $data | ConvertTo-Json -Depth 25
    [IO.File]::WriteAllText($path, $json + "`n", (New-Object Text.UTF8Encoding($false)))
}
function Read-JsonFile([string]$path) {
    $text = Get-Content $path -Raw -Encoding utf8
    if ($text.Length -gt 0 -and $text[0] -eq [char]0xFEFF) { $text = $text.Substring(1) }
    return $text | ConvertFrom-Json
}

Step "检查环境"
if (-not (Test-Path (Join-Path $pluginDir "index.js"))) { throw "找不到 plugin/index.js：$pluginDir" }
if (-not (Test-Path (Join-Path $Profile "package.json"))) { throw "找不到 DSH profile：$Profile（用 -Profile 指定）" }
if (-not (Test-Path $DshRoot)) { $DshRoot = Split-Path $Profile -Parent | Split-Path -Parent | Split-Path -Parent }
Info "插件目录: $pluginDir"
Info "DSH profile: $Profile"
Info "DSH 根目录: $DshRoot"

# 工作区：参数 > 运行时配置 > 默认
if (-not $Workspace -and $NapcatDir) {
    $runtimeFile = if ($NapcatDir) { Join-Path $NapcatDir "love-companion.json" } else { $homeConfig }
    if (Test-Path $runtimeFile) {
        try { $Workspace = (Read-JsonFile $runtimeFile).workspace } catch {}
    }
}
if (-not $Workspace) { $Workspace = Join-Path $env:USERPROFILE "love" }
if (Test-Path $Workspace) { Info "聊天工作区: $Workspace" }
else { Write-Warning "工作区不存在：$Workspace（装完可以在面板「向导」里改）" }

# NapCat：参数 > 默认位置
if ($SkipNapCat) { $NapcatDir = "" }
if (-not $NapcatDir) {
    $guess = if ($env:NAPCAT_DIR) { $env:NAPCAT_DIR } else { Join-Path $env:USERPROFILE "NapCat" }
    if (Test-Path (Join-Path $guess "napcat.mjs")) { $NapcatDir = $guess }
}
if ($NapcatDir -and (Test-Path (Join-Path $NapcatDir "napcat.mjs"))) { Info "NapCat: $NapcatDir" }
else { Write-Warning "没找到 NapCat（napcat.mjs）；只装插件，QQ 通道稍后手动配"; $NapcatDir = "" }

# QQ 号：参数 > NapCat 配置文件名
if (-not $BotQQ -and $NapcatDir) {
    $cfg = Get-ChildItem (Join-Path $NapcatDir "config") -Filter "onebot11_*.json" -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($cfg -and $cfg.BaseName -match "onebot11_(\d+)") { $BotQQ = $Matches[1] }
}
if (-not $BotQQ) { Write-Warning "没确定机器人 QQ 号；可用 -BotQQ 指定" }
if ($BotQQ -and -not $OwnerQQ) { Write-Warning "没给 -OwnerQQ，运行时配置里会留 0（面板可补）" }

if (-not $Token) {
    $bytes = New-Object byte[] 24
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($bytes)
    $Token = ($bytes | ForEach-Object { $_.ToString("x2") }) -join ""
}
Info ("Token: " + $Token.Substring(0, [Math]::Min(8, $Token.Length)) + "…（完整值写进 NapCat 与运行时配置）")

Step "登记插件到 profile"
$pkgPath = Join-Path $Profile "package.json"
$pkg = Read-JsonFile $pkgPath
if (-not $pkg.dependencies) { throw "profile package.json 没有 dependencies" }
if (-not $pkg.dsh) { $pkg | Add-Member -NotePropertyName dsh -NotePropertyValue ([pscustomobject]@{}) }
if (-not $pkg.dsh.profile) { $pkg.dsh | Add-Member -NotePropertyName profile -NotePropertyValue ([pscustomobject]@{}) }
if (-not ($pkg.dsh.profile.PSObject.Properties.Name -contains "bundles")) { $pkg.dsh.profile | Add-Member -NotePropertyName bundles -NotePropertyValue @() }

$depSpecs = [ordered]@{
    "dsh-memory-network" = ("file:" + ($pluginDir -replace "\\", "/"))
}
if (-not ($pkg.dependencies.PSObject.Properties.Name -contains "meow-memory")) { $depSpecs["meow-memory"] = "0.32.1" }
if (-not ($pkg.dependencies.PSObject.Properties.Name -contains "dsh-onebot-qq")) { $depSpecs["dsh-onebot-qq"] = "^0.9.4" }

foreach ($name in $depSpecs.Keys) {
    if ($pkg.dependencies.PSObject.Properties.Name -contains $name) {
        $pkg.dependencies.$name = $depSpecs[$name]
        Act "更新依赖: $name = $($depSpecs[$name])"
    } else {
        $pkg.dependencies | Add-Member -NotePropertyName $name -NotePropertyValue $depSpecs[$name]
        Act "添加依赖: $name = $($depSpecs[$name])"
    }
    if ($pkg.dsh.profile.bundles -notcontains $name) {
        $pkg.dsh.profile.bundles = @($pkg.dsh.profile.bundles) + $name
        Act "加入 bundles: $name"
    }
}
if (-not $DryRun) {
    Backup-File $pkgPath
    Write-Utf8Json $pkgPath $pkg
    Info "已写入 $pkgPath"
}

Step "安装依赖"
if ($SkipDeps) {
    Info "按 -SkipDeps 跳过 pnpm"
} else {
    $pnpm = Join-Path $DshRoot "resources\runtime\primary-runtime\dependencies\pnpm\bin\pnpm.mjs"
    $node = Join-Path $DshRoot "resources\runtime\primary-runtime\dependencies\node\bin\node.exe"
    if (-not (Test-Path $pnpm) -or -not (Test-Path $node)) {
        Write-Warning "没找到 DSH 自带 pnpm/node（$pnpm）；请手动在 profile 里 pnpm install，或加 -SkipDeps"
    } elseif ($DryRun) {
        Act "pnpm install --prefer-offline（cwd=$Profile）"
    } else {
        Act "pnpm install --prefer-offline（cwd=$Profile）"
        Push-Location $Profile
        try {
            & $node $pnpm install --prefer-offline
            if ($LASTEXITCODE -ne 0) { Write-Warning "pnpm install 退出码 $LASTEXITCODE；检查网络或先手动安装" }
        } finally { Pop-Location }
    }
}

Step "配置 NapCat（OneBot 反向 WS）"
if (-not $NapcatDir) {
    Info "跳过：没有 NapCat 目录"
} else {
    $onebotFile = $null
    if ($BotQQ) {
        $candidate = Join-Path $NapcatDir "config\onebot11_$BotQQ.json"
        if (Test-Path $candidate) { $onebotFile = $candidate }
    }
    if (-not $onebotFile) {
        $candidate = Join-Path $NapcatDir "config\onebot11.json"
        if (Test-Path $candidate) { $onebotFile = $candidate }
    }
    if (-not $onebotFile) {
        Write-Warning "没找到 onebot11 配置；请先在 NapCat WebUI 里登录一次 QQ"
    } else {
        Info "配置文件: $onebotFile"
        $cfg = Read-JsonFile $onebotFile
        if (-not $cfg.network) { $cfg | Add-Member -NotePropertyName network -NotePropertyValue ([pscustomobject]@{}) }
        if (-not ($cfg.network.PSObject.Properties.Name -contains "websocketClients")) { $cfg.network | Add-Member -NotePropertyName websocketClients -NotePropertyValue @() }

        $client = $cfg.network.websocketClients | Where-Object { $_.name -eq "dsh-onebot" } | Select-Object -First 1
        if (-not $client) {
            $client = [pscustomobject]@{
                name = "dsh-onebot"; enable = $true; url = "ws://127.0.0.1:$QqPort/ws"
                messagePostFormat = "array"; reportSelfMessage = $false; reconnectInterval = 5000
                token = $Token; debug = $false; heartInterval = 30000
            }
            $cfg.network.websocketClients = @($cfg.network.websocketClients) + $client
            Act "新增 websocketClients: dsh-onebot -> ws://127.0.0.1:$QqPort/ws"
        } else {
            Act "更新 websocketClients: dsh-onebot -> ws://127.0.0.1:$QqPort/ws"
            $client.enable = $true
            $client.url = "ws://127.0.0.1:$QqPort/ws"
            $client.token = $Token
            if (-not $client.messagePostFormat) { $client | Add-Member -NotePropertyName messagePostFormat -NotePropertyValue "array" }
        }

        if ($HttpPort -gt 0) {
            if (-not ($cfg.network.PSObject.Properties.Name -contains "httpServers")) { $cfg.network | Add-Member -NotePropertyName httpServers -NotePropertyValue @() }
            $existing = $cfg.network.httpServers | Where-Object { $_.name -eq "memory-network-direct" } | Select-Object -First 1
            if ($existing) {
                $existing.enable = $true; $existing.port = $HttpPort; $existing.token = $Token
            } else {
                $server = [pscustomobject]@{ name = "memory-network-direct"; enable = $true; host = "127.0.0.1"; port = $HttpPort; token = $Token }
                $cfg.network.httpServers = @($cfg.network.httpServers) + $server
            }
            Act "HTTP 直发: 127.0.0.1:$HttpPort"
        } else {
            Info "没开 HTTP 直发（要 0 token 主动消息时加 -HttpPort 6700）"
        }

        if (-not $DryRun) {
            Backup-File $onebotFile
            Write-Utf8Json $onebotFile $cfg
            Info "已写入 $onebotFile"
        }
    }

    Step "写运行时配置"
    $owner = 0; if ($OwnerQQ) { $owner = [int64]$OwnerQQ }
    $bot = 0; if ($BotQQ) { $bot = [int64]$BotQQ }
    $runtime = [ordered]@{
        channel = "qq"
        proactiveEnabled = $false
        minGapHours = 4
        maxGapHours = 12
        quietAfterChatMinutes = 120
        activeStartHour = 10
        activeEndHour = 22
        qqHost = "127.0.0.1"
        qqPort = $QqPort
        botQQ = $bot
        ownerQQ = $owner
    }
    $homeConfig = Join-Path $env:USERPROFILE ".dsh\love-companion.json"
    New-Item -ItemType Directory -Force -Path (Split-Path $homeConfig) | Out-Null
    if ($NapcatDir) { $runtime.napcatDir = $NapcatDir }
    if ($Workspace -and (Test-Path $Workspace)) { $runtime.workspace = $Workspace }
    else { Write-Warning "工作区路径不存在（可能是编码问题）：$Workspace；先不写 workspace，装完在面板里选" }
    if ($HttpPort -gt 0) {
        $runtime.qqHttpUrl = "http://127.0.0.1:$HttpPort"
        $runtime.qqHttpToken = $Token
    }
    $runtimeFile = Join-Path $NapcatDir "love-companion.json"
    Act "写入 $runtimeFile"
    if (-not $DryRun) {
        Backup-File $runtimeFile
        Write-Utf8Json $runtimeFile $runtime
        Write-Utf8Json $homeConfig $runtime
        Info "已写入（并同步到 $homeConfig）"
    }
}

Step "完成（$script:actions 个动作）"
Info "下一步："
Info "  1. 重启 NapCat（让它连上 ws://127.0.0.1:$QqPort/ws）"
Info "  2. 完全重启 DSH"
Info "  3. 打开面板「向导」检查清单，确认通道在线"
if ($DryRun) { Write-Host "`n这是 dry-run，没有改任何文件。" -ForegroundColor Yellow }
