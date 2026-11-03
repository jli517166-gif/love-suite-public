# Live2D 接入思路（调研笔记）

参考项目：[B612plant/dsh-plugin-live2d-stage](https://github.com/B612plant/dsh-plugin-live2d-stage)（npm 包名 `dsh-plugin-live2d-stage`，v0.5.3）。

这份文档记录设计与源码核查，不复制它的代码，也不打包它的模型。

2026-11-02复核：本机舞台state路由404，陪伴avatar返回available=false，不能称已经联调。AIRI同时支持Live2D和VRM，现有`/state`只是本库快照，不是已验证的AIRI原生协议。后续以[技能与独立身体完整路线](LEARNING-AND-BODY-ROADMAP.md)为准。舞台0.5.3已核查源码bc6fe32；缺少明确程序复制许可，原生载体/SDK/模型需分别验收。以下接法是设计选项，未验证准入的请求不能直接启用。

## 它已经提供了什么

它本身是一个完整的 DSH 插件：

- **服务端**：占用 `/live2d-stage/` 前缀，注册 Web 路由
- **播放器**：浏览器里跑 Cubism SDK，通过 SSE 长连接收动作
- **Agent 工具**（动作控制开启时才注册）：
  - `live2d_list_motions`
  - `live2d_list_expressions`
  - `live2d_present({ characterId, motionId, expressionId })`
- **数据目录**：`%USERPROFILE%\.dsh\live2d-stage`
  - `characters.json`：角色列表和当前选中角色
  - `catalogs/<角色ID>/motions.json`
  - `catalogs/<角色ID>/expressions.json`
  - `models/<角色ID>/...`：模型、纹理、动作、表情

### 关键 HTTP 路由（实测源码）

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/live2d-stage/state` | 当前状态快照 |
| GET | `/live2d-stage/stream?client=...&character=...` | 播放器 SSE，服务端推动作 |
| POST | `/live2d-stage/play` | 直接播放 `{ characterId, actionId }` |
| POST | `/live2d-stage/preferences` | 开关动作控制 / 悬浮窗 |
| POST | `/live2d-stage/import` | 导入模型 ZIP |

动作 ID 的格式：

```
motion:<动作组>:<序号>
expression:<表情名>
```

播放器连的是 SSE；`/play` 是服务端向 SSE 广播的入口。

## 三种接法

### A. 已获准后 POST `/live2d-stage/play`（历史设计选项）

我们的插件在服务端读它的目录，把心情映射成动作 ID，再 POST 到本机端口。

优点：

- 不依赖它的 Agent 工具，不需要占用对话 token
- 我们完全掌握“什么时候播”
- 它卸载/没启动时静默跳过

风险：

- `handler` 里有 `ctx.connection.admit(req)`，服务端请求能否通过要看它的准入实现；最坏情况是 403，需要退回 B
- 它的路由和内部实现可能随版本变

伪代码：

```js
const port = webServerRef?.port;
const res = await fetch(`http://127.0.0.1:${port}/live2d-stage/play`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ characterId, actionId: "motion:Idle:0" }),
});
```

### B. 让 Agent 顺手调 `live2d_present`（零耦合）

在插件注入的系统提示里加一段：

> 如果 `live2d_present` 可用，每次回复前按当前心情从动作目录里选一个 motion + expression 提交。

优点：不用碰它的 HTTP/准入；缺点：多一次工具调用、多占上下文，而且它必须先开“动作控制”。

### C. 只读建议接口（已实现）

我们的 `GET /love-companion/api/avatar` 在目录存在时返回以下字段示意（本机当前为available=false，不是这份成功示例）：

```json
{
  "emotion": "开心",
  "activity": "打招呼",
  "available": true,
  "characterId": "示例角色ID",
  "motion": { "id": "示例动作ID", "name": "打招呼" },
  "expression": { "id": "示例表情ID", "name": "开心" },
  "motionHints": ["举手", "IDLE"],
  "expressionHints": ["开心"]
}
```

需要适配器把这些字段送给实际播放器；我们目前不主动推，也没有确认AIRI原生识别它。按新增路线验证受控桥接后，再决定采用IPC、宿主工具或已获准的HTTP接口。

## 心情 → 动作的映射

动作/表情的**名字可以在它的设置里改**，所以不能硬编码 ID，应该按名字关键词找：

| 我们的心情 | motion 关键词 | expression 关键词 |
|---|---|---|
| 开心 | IDLE / 举手 | 开心、笑、屑屑眼 |
| 兴奋 | 举手、竖手指 | 兔牙、圈圈眼 |
| 平静 | IDLE | 默认 |
| 害羞 | IDLE / 前倾 | 脸红、流冷汗 |
| 想念 | 前倾、IDLE | 圈圈眼 |
| 不安 | IDLE | 流冷汗 |
| 难过 | IDLE | 哭、流冷汗 |
| 委屈 | IDLE | 哭 |
| 生气 | 竖手指 | 生气、屑屑眼 |

还要叠一层“在做什么”：

- 看书/发呆 → IDLE
- 打招呼 → 举手
- 被夸 → 害羞 + 开心

映射先做成**纯函数**，返回 `{ motionKeywords, expressionKeywords }`，再由适配器去目录里找第一个匹配项；找不到就回 `null`。

## 节奏与优先级

- 只在心情变化、或距上次播放 ≥ 30 秒时播；不要每条消息都动
- 播放优先级与打断由新适配器明确设计；旧工具没有实际播放完成回执，时间窗只能抑制重复，不能作为执行成功证据
- 睡觉/离线不播
- 语音播放时优先口型/表情，不叠大动作

## 建议的落地顺序

1. **只读**：`/avatar` 返回建议（不依赖 Live2D 插件，先能测）
2. **适配器**：`plugin/live2d.js`，探测目录 + 映射 + POST `/play`；失败静默
3. **开关**：配置 `live2dEnabled`、`live2dCooldownSeconds`、`live2dBaseUrl`，默认关
4. **面板**：设置里显示检测结果和“试播一个动作”
5. **AIRI**：Live2D 只是渲染器，`/love-companion/api/state` 仍是唯一的状态源

## 许可与边界

- 它的模型（DeepSeek-chan）有独立使用须知：公开使用要署名，**禁止擅自重新分发完整模型**
- Cubism SDK 受 Live2D 许可约束
- 我们只做“读目录 + 发请求”的适配器，不复制它的播放器、不打包模型
- 如果以后要内置播放器，需要单独评估 Cubism SDK 许可

## 对我们的价值

- 它是现成的“身体渲染层”，我们不需要自己做 Live2D 渲染
- 我们的优势仍是灵魂：心情、心跳、主动、记忆；接上之后只是把 `emotion/motion` 多送一个出口
- 与 AIRI 的关系：AIRI提供Live2D和VRM两类渲染基础；舞台提供DSH专用动作/悬浮/会话交互。选择单一实际播放器，通过适配器接入同一份受控状态；不假定它们原生识别本库`/state`
