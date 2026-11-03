# SOUL.md（灵魂 v1：与介质解耦）

> 一句话：**灵魂不认识 QQ。** 灵魂只产出"意图"，介质负责把意图送出去；介质不在线，意图进发件箱。

## 三层

```
soul/        记忆、心情、好感、自我叙事、什么时候想说话、说什么
             （index.js 里的 memory / mood / proactive 决策）
channel/     介质适配器：qq（OneBot 注入）、未来的 web / airi
outbox/      发件箱：介质不在线时先存着，回来再补发；过期就丢
```

## 意图（intent）

灵魂对外只说这一种结构：

```js
{
  id: "i…",
  text: "（内心：……）",   // 现阶段发的是给 agent 的内心提示
  kind: "memory | mood | life",
  emotion: "想念",         // 生成时的心情
  voice: false,            // 这次要不要顺带语音
  priority: "low",
  createdAt: "2026-10-30T19:00:00"
}
```

通道只需要实现三个方法：

```js
channel.id                       // "qq"
await channel.available()        // 能否投递
channel.deliver(intent)          // 投递，失败抛错
channel.describe()               // 给 status 看的一行描述
```

## 投递纪律（都写在代码里，有测试）

| 情况 | 行为 |
|---|---|
| 通道在线 | 立刻投递 |
| 通道离线 / 投递抛错 | 进发件箱 `memory/outbox.jsonl`，不丢 |
| 通道恢复 | 只补发**最新**一条未过期的；旧的不逐条补 |
| 发件箱条目超过 6 小时 | 静默丢弃（昨天想说的话今天说更糟） |
| 静默时段（activeStartHour–activeEndHour 之外） | 不补发，留在箱子里 |
| 她想说话之后你们又聊上了 | 这条判 `stale` 直接丢 |
| 同样文本 10 分钟内 | 去重，不重复排队 |

## 灵魂自己的计时器

`memory/state.json`：

```json
{ "created_at": "...", "last_seen": "2026-10-30T19:00:00", "message_count": 12 }
```

- `last_seen` 由入站消息更新（**不看 QQ 会话文件的 mtime**）。
- 主动聊天的"刚聊完多久不打扰"读它，所以换任何介质都成立。
- 从没见过面时 `last_seen=null`，不算"刚聊完"，也不算"沉默很久"。

## 现在的边界（别装作已经做到）

- 只有 `qq` 和 `none` 两个通道；web 通道还没写。
- 意图里的 `text` 还是"内心提示"格式，由 agent 消费；不是最终那句人话。
- `voice` 只是意图上的标记，真正出声仍由 agent + 语音 skill 决定。
- 发件箱目前靠主动调度器每 3–11 分钟顺带 drain，没有独立的补发循环。

## 心跳（pulse）

每分钟一次，**纯本地计算，0 token**。写 `memory/pulse.json`：

```json
{
  "activity": { "id": "reading", "label": "窝着看书", "since": "…", "until": "…" },
  "needs": { "attachment": 0.62, "curiosity": 0.71, "energy": 0.85 }
}
```

- `activity`：按小时从活动池里挑（看书 / 发呆 / 整理小本子 / 听歌 / 窗边 / 收拾屋子 / 睡了），30–90 分钟换一次。
- `attachment`（依恋）：越久没聊越高，聊上天回落 45%（不归零）。
- `curiosity`（好奇）：随时间缓慢上涨。
- `energy`（精力）：跟着一天走，凌晨 0.12、上午 0.9。
- 这些数字参与决策：依恋 > 0.7 时"今天算了"的跳过概率减半；主动聊天多一类"你现在在做什么"的话题；`/state` 会把 `doing` 和 `needs` 给身体。

## 自动 appraisal

模型经常忘记调 `love_record kind=feeling`（实测一整晚好感停在 5）。兜底规则：

- 从用户原话里识别强信号：`喜欢你 / 好可爱 / 抱抱 / 想你了 / 谢谢你 / 好棒` → +1；`滚 / 闭嘴 / 讨厌你 / 骗我 / 失约` → -1。
- 关键词前 4 个字里有否定词（不/别/没/勿/未）→ 翻转，不判。
- **先剥掉 `[QQ表情:…]` 注解**再判断，否则注解里的"喜欢/亲昵"会误伤。
- 一次最多 ±1，15 分钟冷却，照样受每日 +2 / -5 上限约束，写进 `feeling_log`（原因带「自动评估」）。
- 配置 `autoAppraisal: false` 可关。

## 自我叙事（self.md）

`memory/self.md` 分两段：

- 手写部分（`# 我是谁` 下面）：由 agent 用 `love_self action=write` 写，插件不覆盖。
- `<!-- auto -->` 之后的「现在」：插件每次读的时候按结构化状态重写（关系、喜欢/讨厌、边界、最近三件事、此刻在做什么）。

`love_recall` 只带手写部分的摘要（≤400 字），不把整份倒进上下文。

## 活动历史（activity.jsonl）

心跳每次换活动就记一笔 `{date, id, label, since, until}`（最多 300 条）。
`love_recall` 会带一句「今天做过：…」，`love_doctor` 显示今天几条、最近几个活动。

## 表情包图库（stickers.json）

- 别人发的表情包（`[表情包:路径]`）会自动收进 `memory/stickers/`，按内容 sha1 去重，最多 200 张。
- `love_sticker action=list|search|add` 查看/搜索/手动收；发的时候直接把 `file` 给 `qq_send_image`。
- 需要通道补丁：`patches/patch-onebot-face-ids.mjs` 会把表情包段的本地路径保留下来（否则只有占位符）。

## 调度状态跟着工作区走

`memory/proactive.json`（以前在 `C:\NapCat\proactive-state.json`）：

- 每个聊天工作区各存一份，换区互不干扰。
- 第一次读时自动把老位置那份迁移进来，然后把老文件改名 `.migrated` 留档。
- 面板运行时配置 `love-companion.json` 仍是全局的（它是插件设置，不是灵魂状态）。

## 直接说人话（省一次模型调用）

主动聊天原来是把「（内心：…）」塞给 agent，让它跑一整轮（约 2 万 token）才换回一两句话。
现在灵魂会先用模板生成一句 `line`（`compose.js`，0 token）：

- 如果通道支持直发（QQ 配了 `qqHttpUrl`，即 NapCat 的 HTTP 接口），就直接把 `line` 发出去，
  **这一轮模型调用整个省掉**；
- 没配 HTTP 接口就退回注入队列，`line` 也会存进发件箱，等直发通道可用时再发。

模板按「在做什么 + 什么心情」组合，比如「在看书，看到一半突然想起你。」「有点想你。」
质量上限靠模板，不追每次惊艳——适合"她一个人在过日子"这种短句。要更自然可以以后换成小模型。

## 多工作区（一个插件，多个灵魂）

配置里除了 `workspace`，还能给 `workspaces`（数组）：

- 非空时以 `workspaces` 为准；每个工作区各有一套 `memory/`（记忆、心情、心跳、发件箱、调度状态），互不干扰。
- 工具按当前会话的 cwd 反查自己属于哪个工作区，不会串到别的区；不在列表里的会话直接拒绝。
- 心跳按工作区逐个推进；主动聊天也是每个工作区各跑一套（各自的上限/间隔）。
- 换项目区 = 换一个灵魂，工作和聊天彻底分开。

## 已经做的（v1）

- 通道解耦：`channels/qq.js` + `none`，QQ 只做探活和投递，代码里不再有 `qqConnected` / `lastChatMinutes` / 写死的机器人号。
- **web 通道**：`channels/web.js`，找同工作区里开着的会话，用 `agent.followup` 把意图排进去；没有会话 = 不可用，进发件箱。
- 发件箱：离线、投递失败、过期、静默时段、聊过天之后的"过期话"，五条纪律都有测试。
- 灵魂计时器：`state.last_seen` 取代 QQ 会话文件的 mtime。
- **心情注入**：每轮把 `当前心情：X（强度 0.3）｜因为：…` 作为动态上下文送进对话（非 love 会话返回空串）。
- **心跳**：活动 + 依恋/好奇/精力，纯本地、0 token，固定 60 秒。
- **冲动驱动**：冲动（依恋/好奇 × 精力）≥ 0.8 时不等随机窗口，直接主动开口（仍受间隔/上限/静默时段约束）。
- **自动 appraisal**：好感因具体的话自己动，有冷却和上限。
- **调度状态跟工作区走**：`memory/proactive.json`，老的 NapCat 状态自动迁移。
- **直发人话**：`compose.js` + OneBot HTTP 直发，主动消息可以零 token 发出去。
- **多工作区**：`workspaces` 列表，每个区一套灵魂与调度。
- **自我叙事**：`self.md`，手写 + 自动「现在」，recall 带摘要。
- **活动历史**：`activity.jsonl`，能回答"她今天都干了什么"。
- **表情包图库**：自动收下别人发的表情包（去重、上限 200），`love_sticker` 可查/可加。
- **love_doctor**：一条命令体检。
- **记忆星图**：内嵌 `/love-companion/star/`，日记/小生活/自我也进图层，数据现读现生成。

## 下一步

1. `airi` 通道：同一份意图接口，投给身体。
2. 多工作区的面板编辑（现在靠配置写列表）。
3. 意图从模板升级成"小模型润色"（可选，按 token 预算开）。
