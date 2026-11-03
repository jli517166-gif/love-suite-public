# love-companion 配置手册

> **🧪 测试阶段（`1.15.0`）**
> 本文档描述的是当前测试版；配置项、数据格式和默认值仍可能变化。
> 遇到记忆不一致、整理卡住、通道异常属于正常现象；先备份 `<workspace>/memory` 再改配置。

> 适用：DSH 0.2.x / Windows / desktop profile
> 范围：`dsh-memory-network` 插件 + `meow-memory` + skill 模板
> 不在范围：Agent Voice / MCP。语音由使用者自己在 Agent Voice 服务里对接。

## 1. 组件与目录

```
love-suite/
  plugin/                 dsh-memory-network（本手册主角）
  skills/companion-template/SKILL.md
  EVALUATION.md

D:\App\Git\memory-universe\   记忆星海（独立，可选）
```

插件运行后读写的目录：

```
<固定工作区>\
  memory\
    profile.json        称呼、生日、喜好、边界、事实
    relationship.json   好感、信任、阶段、心情镜像
    mood.json           当前心情、强度、原因、last_triggered
    state.json          上次见面
    journal\YYYY-MM-DD.md
    life.jsonl          没聊天时的小生活
```

运行时控制文件：

```
C:\NapCat\love-companion.json      管理面板保存的工作区/主动参数（全局，插件设置）
<固定工作区>\memory\proactive.json    主动聊天状态（跟着工作区走）
<固定工作区>\memory\pulse.json        心跳：活动 + 依恋/好奇/精力
<固定工作区>\memory\outbox.jsonl      发件箱：通道离线时攒的意图
<固定工作区>\memory\state.json        上次见面 / 累计消息数
```

> 老版本把主动状态写在 `C:\NapCat\proactive-state.json`，插件第一次读时会自动迁移进工作区，
> 并把老文件改名 `.migrated` 留档。换工作区不再互相干扰。

## 2. 安装插件

### 2.1 复制插件

```powershell
$src = "D:\App\Git\love-suite\plugin"
$dst = "$env:USERPROFILE\.dsh\profiles\desktop\node_modules\dsh-memory-network"
if (Test-Path $dst) { Remove-Item $dst -Recurse -Force }
Copy-Item $src $dst -Recurse
```

### 2.2 改 profile package.json

文件：

```
C:\Users\<你>\.dsh\profiles\desktop\package.json
```

加依赖：

```json
"dsh-memory-network": "file:D:/App/Git/love-suite/plugin"
```

加 bundle：

```json
"dsh-memory-network"
```

完整示例（保留你已有的项）：

```json
{
  "name": "dsh-profile-desktop",
  "private": true,
  "dependencies": {
    "dsh-onebot-qq": "^0.9.4",
    "meow-memory": "0.32.1",
    "dsh-memory-network": "file:D:/App/Git/love-suite/plugin"
  },
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "dsh-onebot-qq",
        "meow-memory",
        "dsh-memory-network"
      ]
    }
  }
}
```

### 2.3 改 profile cordis.patch.yml

插件包自带 `cordis.patch.yml`，bundle 会 insert 一行；profile 里只需要覆盖 config：

```yaml
- id: dsh-memory-network
  config:
    enabled: true
    workspace: 'C:\test\love'
    proactiveEnabled: true
    minGapHours: 4
    maxGapHours: 12
    dailySkipChance: 0.45
    maxPerWeek: 3
    quietAfterChatMinutes: 120
    activeStartHour: 10
    activeEndHour: 22
    voiceChance: 0.08
    voiceCooldownHours: 8
    injectPath: 'C:\Users\<你>\.dsh\media\onebot\qq-inject.jsonl'
```

重启 DSH。

## 3. 固定工作区

优先用管理面板配置：

1. 左侧栏「陪伴」图标
2. 「固定工作区路径」填目标目录
3. 「保存工作区」

插件每次工具调用都会重新读取这个路径，不需要重启。

也可以直接写运行时文件：

```json
{
  "workspace": "E:\\path\\to\\your\\workspace",
  "proactiveEnabled": true,
  "minGapHours": 4,
  "maxGapHours": 12,
  "dailySkipChance": 0.45,
  "activeStartHour": 10,
  "activeEndHour": 22,
  "quietAfterChatMinutes": 120
}
```

保存到：

```
C:\NapCat\love-companion.json
```

> 只接受已存在的目录。工具、记忆、心情、生活记录全部跟着这个路径走。

## 4. 管理面板与工具

### 工具

| 工具 | 作用 |
|---|---|
| `love_recall` | 称呼、偏好、边界、自动心情、最近日记、记忆网事件 |
| `love_mood` | `get` / `refresh`，只读；不能手动设置 |
| `love_life` | `add` / `recent` 小生活 |
| `love_record` | `note` / `fact` / `feeling` / `milestone` |
| `love_proactive` | `status` / `dry_run` |
| `love_emoji` | QQ 表情手册：`decode` / `search` / `status` |
| `love_doctor` | 一条命令体检：记忆文件、通道、表情补丁、心跳、发件箱、调度、开关 |

### 管理面板

- 当前心情、主动状态、上次主动、随机窗口、下次可发
- 主动开关、最短/最长间隔、当天跳过概率、活跃时段
- 固定工作区路径
- 预览一条主动消息

### API

| 方法 | 路径 | 作用 |
|---|---|---|
| GET | `/love-companion/api/status` | 状态、心情、配置、窗口 |
| POST | `/love-companion/api/config` | 保存主动参数/工作区 |
| POST | `/love-companion/api/mood` | 只读重算心情 |
| POST | `/love-companion/api/dry-run` | 生成一条预览 |

## 5. 自动心情

心情**不能手动设置**。

插件会根据以下信号自动加权随机：

- 最近 3 天日记关键词：夸、约定、失约、冷落、边界、想念
- 最近好感变化
- 多久没聊天
- 当前时段
- 当前心情惯性

触发后写 `mood.json`，包括 `emotion`、`intensity`、`causes`、`last_triggered`。45 分钟内不频繁变，45% 概率跳过。

## 6. 对接 meow-memory

**不需要代码对接。** 两个插件各自独立：

- love-companion：陪伴 JSON 记忆
- meow-memory：七层 SQLite 记忆

安装 meow：

```powershell
cd "$env:USERPROFILE\.dsh\profiles\desktop"
pnpm add meow-memory@0.32.1
```

profile 配置：

```yaml
- id: meow-memory
  config:
    promptLang: zh
    hitTopK: 2
    titleMax: 40
    disabledWorkspaces:
      - 'E:\App\deepseek harness项目\1'
      - 'E:\App\deepseek harness项目\2'
```

love-only 补丁：

```
C:\Users\<你>\.dsh\profiles\desktop\node_modules\meow-memory\lib\index.js
```

补丁函数 `workspaceDisabledMatch` 只允许目标工作区；更新 meow 后重跑：

```
E:\App\deepseek harness项目\1\reapply-meow-loveonly.py
```

Agent 层分别使用：

- 陪伴层：`love_recall` / `love_record` / `love_mood`
- 长期层：`memory_search` / `memory_remember` / `memory_project`

## 7. Skills

分享用通用模板：

```
love-suite\skills\companion-template\SKILL.md
```

复制到目标工作区：

```
<workspace>\.dsh\skills\companion\SKILL.md
```

人格 skill 由使用者自己安装；模板不含人名、人格、私人记忆。

如果同时使用人格和陪伴模板：

- persona skill 负责语气/身份
- companion-template 负责记忆、自动心情、主动协议

## 8. 主动聊天

- 只在 DSH 运行时工作
- 10:00–22:00 随机抽一个时刻
- 检查间隔 3–11 分钟随机
- 45% 概率当天跳过
- 发送间隔 4–12 小时随机
- 最多 1 天 1 次、1 周 3 次
- 话题从记忆 / 心情 / 小生活随机挑
- 注入路径：`injectPath`，默认 `C:\Users\<你>\.dsh\media\onebot\qq-inject.jsonl`

## 9. QQ / NapCat（可选）

插件本身不依赖 QQ。需要 QQ 时再配 `dsh-onebot-qq`：

```yaml
- id: dsh-onebot
  config:
    mode: reverse
    host: 127.0.0.1
    port: 8643
    accessToken: '<你的 token>'
    adminUsers:
      - '<你的 QQ>'
    dmPolicy: open
    groupPolicy: disabled
    workspacePath: 'E:\path\to\workspace'
```

NapCat 配置反向 WS 到 `127.0.0.1:8643`，token 与上面一致。不要提交 token。

### 9.1 QQ 表情通道补丁（可选，但强烈建议）

默认的 `dsh-onebot-qq` 会把 QQ 小黄脸按顺序映射成 Unicode emoji，id 丢失：
`14 微笑 → 🥰`、`318 崇拜 → 🦓`、`319 比心 → 🦌`。模型只能猜。

`plugin/patches/patch-onebot-face-ids.mjs` 把 face 段改成 `[QQ表情:id]`，
交给插件的表情手册注解：

```powershell
node D:\App\Git\love-suite\plugin\patches\patch-onebot-face-ids.mjs
# 只检查状态（不写文件）
node D:\App\Git\love-suite\plugin\patches\patch-onebot-face-ids.mjs --check
```

- 会改 profile 里那两份副本：`dsh-onebot-qq/lib/cq.js`、`dsh-onebot-qq/lib/inbound.js`
- 改前自动备份成 `*.bak-face-<时间戳>`；幂等，重复跑只报告状态
- **升级 `dsh-onebot-qq` 或 `pnpm install` 后要重跑**；`love_emoji action=status` 可确认
- 打完补丁重启 DSH 生效
- 自检：`node D:\App\Git\love-suite\plugin\patches\verify-emoji.mjs`（全过就是通的）

## 10. 配置项参考

| 字段 | 默认 | 说明 |
|---|---|---|
| `enabled` | true | 插件总开关 |
| `workspace` | 当前 love 路径 | 主聊天工作区 |
| `workspaces` | [] | 额外聊天工作区列表；**非空时以它为准**（一个插件管多个聊天区，各一套记忆/心情/心跳/调度），留空就只用 `workspace` |
| `proactiveEnabled` | false | 主动聊天 |
| `minGapHours` | 4 | 最短发送间隔 |
| `maxGapHours` | 12 | 最长发送间隔 |
| `dailySkipChance` | 0.45 | 当天跳过概率 |
| `maxPerDay` | 1 | 每天上限 |
| `maxPerWeek` | 3 | 每周上限 |
| `quietAfterChatMinutes` | 120 | 刚聊完多久不主动 |
| `activeStartHour` | 10 | 活跃开始 |
| `activeEndHour` | 22 | 活跃结束 |
| `voiceChance` | 0.08 | 出现「语音提示」的概率 |
| `voiceCooldownHours` | 8 | 两次语音提示最短间隔 |
| `injectPath` | onebot 注入文件 | 主动消息投递 |
| `emojiEnabled` | true | QQ 表情自动注解（`[QQ表情:id]` → 名称 + 含义）；关掉后 `love_emoji` 工具仍可用 |
| `channel` | qq | 介质：`qq` = OneBot 注入；`web` = 投给同工作区开着的 Web 会话（不用重启，改运行时配置即可）；`none` = 不接通道 |
| `qqHost` / `qqPort` | 127.0.0.1 / 8643 | 通道探活地址（NapCat ws-reverse 端口） |
| `qqHttpUrl` | 空 | NapCat HTTP 接口地址（如 `http://127.0.0.1:6700`）。配上后主动消息**直接发人话**，省掉一整轮模型调用 |
| `qqHttpToken` | 空 | NapCat HTTP 接口的 token |
| `botQQ` / `ownerQQ` | 内置 | 注入事件的机器人号 / 主人号；换人必改，别再写死 |
| `moodInjection` | true | 每轮把「当前心情」作为动态上下文送进对话（约 +30 token/轮）；关掉就退回纯记忆驱动的语气 |
| `autoAppraisal` | true | 模型忘了调 `feeling` 时，按话里的强信号自动 ±1；15 分钟冷却 + 每日上限 |
| `autoLearn` | true | 自动学习：对话里出现「教你/记住/以后你可以」这类句子时，自动记一条能力；误记可关 |
| `injectEnabled` | false | 调试：主动消息写进 `qq-inject.jsonl`。onebot 的注入默认关闭，生产别开；没配 `qqHttpUrl` 时主动消息改走 web 会话，没会话就进发件箱 |
| `composeEnabled` | true | 主动消息用模板写成一句可直接发送的人话；配 `qqHttpUrl` 时直发，省一轮模型调用 |

> 心跳固定 60 秒一次、纯本地计算、**0 token**，所以没有开关和间隔配置——不用为了省钱关它。
> 上面这些开关都能在「陪伴」面板 → 功能开关 里点，也可以写进运行时配置；
> 都是每次现读，改完**不用重启**。插件管理页的配置项也带同样的说明。

### 直发人话（可选，省一轮模型调用）

主动聊天默认要把「（内心：…）」交给 agent 跑一轮才换回一句话；配上 NapCat 的 HTTP 接口后，
灵魂可以用模板直接发一句人话（`compose.js`），这一轮模型调用整个省掉。

1. 在 `C:\NapCat\config\onebot11_<QQ号>.json` 的 `network.httpServers` 里加：

```json
{
  "name": "love-direct",
  "enable": true,
  "host": "127.0.0.1",
  "port": 6700,
  "token": "<自己定一个>",
  "messagePostFormat": "array",
  "debug": false
}
```

2. 重启 NapCat；
3. 插件配置里加 `qqHttpUrl: 'http://127.0.0.1:6700'`、`qqHttpToken: '<同一个 token>'`；
4. 重启 DSH。之后 `love_proactive status` 的「通道」那行会显示 `direct->http://...`。

> 只绑 `127.0.0.1`，别开到公网。直发失败会自动进发件箱，不会丢。

## 11. 分享检查清单

- [ ] 不带 `<workspace>\memory`、`.dsh-meow`、journal
- [ ] 不带 token、QQ 号、管理员号
- [ ] 锁定 DSH / onebot / meow 版本
- [ ] 不把个人人格 skill 打包
- [ ] 提供通用 companion-template
- [ ] 安装器先检测 DSH profile 和 Node/Python
- [ ] 首次启动初始化空 `memory` 模板
- [ ] 说明 Agent Voice / MCP 不在本套件内

## 12. 故障排查

### 插件没加载

看：

```
C:\Users\<你>\AppData\Roaming\@deepseek-ai\dsh-desktop\logs\crash-*-web-boot.log
```

常见原因：

- client bundle id 与包名不一致 → duplicate factory registration
- profile 被 DSH 升级重置 → bundle/config 丢失
- 插件依赖未安装

### 面板没有「陪伴」图标

- 确认 `dsh-memory-network` 在 bundles 里
- 重启 DSH，再 Ctrl+F5
- 看 crash log 是否有 client import 错误

### 工具报「只允许在 love 工作区使用」

说明当前会话 cwd 不是配置的固定工作区。用面板重新保存工作区。

### 心情不变

- 45 分钟冷却 + 45% 跳过是正常的
- 没有新日记/好感/沉默信号时，会更多停在平静

### 表情认错 / 模型说是「斑马」「小鹿」「心里冒粉红泡泡」

1. 跑 `node plugin\patches\patch-onebot-face-ids.mjs --check`：没应用就补上，重启 DSH
2. 会话里问 `love_emoji action=status`，正常会显示「手册：329 条」「QQ 通道补丁：已应用」
3. 还是不行就看 inbound 原文：`[QQ表情:318]` 有没有出现在消息里（没有说明补丁被覆盖了）
