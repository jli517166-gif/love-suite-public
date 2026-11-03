# 安全与架构审计（2026-10-31）

范围：`plugin/index.js`、`client.js`、`channels/qq.js`、`groups.js`、`guard.js`、`persona.js`、`backup.js`、`meow.js`、`live2d.js`、`graph.js`、`install.ps1`、`install-from-release.ps1`、`deploy.mjs`、GitHub workflows。

审计方式：静态阅读 + 现有 105 项自检 + 手工攻击面检查；另外尝试调用 Codex 安全技能，子代理失败，未采用其结论。本报告只写能定位到代码的结论。

## 结论

未发现 Critical / High 级远程代码执行、路径穿越或命令注入。主要风险集中在“本机信任边界”和“默认不强制鉴权”。

## 发现

### 1. API token 默认不强制（Medium）

`handleApi` 当前不做 token 鉴权（按用户要求已移除令牌功能），本机任何进程/网页（同源限制后）都能读记忆、发消息。

- 触发：共享电脑、或把 127.0.0.1 端口转发到局域网
- 影响：读取全部记忆、导出、触发 `/say`
- 建议：首次安装生成随机 token 并写入运行时配置；或至少对非 loopback 请求强制 token

### 2. 请求体超限时没有立刻断开（Medium，已修）

原 `readRequestBody` 在超过 1MB 时 `reject` 但继续累积 chunk。

- 影响：恶意本机进程可制造内存增长
- 修复：本次已改为 `settled` 标记 + `req.destroy()`，超限立即断开

### 3. token 明文存储（Medium）

令牌功能已移除；旧版本留下的 `apiToken` 不会再被读取。

- 影响：能读本机文件的进程可直接拿到 token
- 说明：本机威胁模型下这层防护本来就有限；建议文档明确，不要把它当远程安全边界

### 4. 审计日志无轮转（Low）

`memory/audit.jsonl` 只追加，没有大小上限。

- 影响：长期运行占磁盘；日志含 route/IP
- 建议：按 1MB 轮转，保留 3 份

### 5. GitHub Actions 用 tag 固定（Low）

`actions/checkout@v4`、`setup-node@v4`、`softprops/action-gh-release@v2` 未固定 commit SHA。

- 影响：上游 action 被篡改时的供应链风险
- 建议：发布仓库固定 SHA

### 6. 星图 DOM 注入面（Low / 已缓解）

`star/index.html` 有多处 `innerHTML`，节点 label 来自记忆内容。

- 现状：`esc()` 转义 label/keywords，详情数字走 `fmt`；未发现可利用点
- 建议：后续新增渲染统一走 `textContent` 或 `esc()`

### 7. `/say` 可以往群发任意文本（Low）

本机调用者可指定群号发送。

- 影响：骚扰群；仅限已配置的 `groupIds` 校验后的群？当前 `/say` 只校验群号格式，不校验是否在允许列表
- 建议：`/say` 的 groupId 必须属于 `groupIds`，否则拒绝

## 已验证安全的部分

- `serveStar` 用 `STAR_FILES` 白名单 + 固定路径，无路径穿越
- `importMemory` 对每条路径做 `path.resolve` 前缀校验，拒绝 `..`
- 备份、导出、群记忆都在工作区 `memory/` 下
- 安装脚本下载 release zip 后校验 SHA256
- 无 SQL；meow 只读打开 SQLite
- 无动态 `eval`/`new Function` 处理用户输入
- 主动消息外发只走配置好的 NapCat HTTP

## 发布前必须修

1. 决定 token 默认策略：首次安装生成，或明确“只在本机回环使用”
2. 审计日志轮转
3. `/say` 群号白名单校验
4. GitHub Actions 固定 SHA

## 备注

- 子代理 Codex 审计以退出码 3221225786 失败，没有返回报告；以上为人工静态审计，不等于完整渗透测试
- 建议后续补：并发写同一 JSON 的压力测试、真实群消息 E2E
