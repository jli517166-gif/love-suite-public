# Development, diagnosis and delivery

## Reproduce a development environment

Use Node24 and the npm version in package.json. From the repository root:

```powershell
npm ci --ignore-scripts --no-audit --no-fund
npm run build:client
npm run format:check
npm test
```

The package lock is authoritative. Commit changed source and regenerated client together. CI checks the output independently, runs Windows regression and packs the actual install shape. Publishing is a separate manual workflow; do not run it for ordinary maintenance.

## Diagnose without exposing material

Inspect `reflectionWorker.lastResult.maintenance` for status/code/stage/reason/retryable. `retryable` means reread/review can resolve a temporary condition; it does **not** trigger another model request or automatically apply a suggestion. The worker still has its existing budget/cooldown and queue ownership.

Suggestion-file filesystem failures are `MAINTENANCE_STORAGE_FAILED` (retryable); malformed JSON/schema remain `MAINTENANCE_STORAGE_INVALID`. Only the initial stat ENOENT means an absent file; a file disappearing during read fails safely instead of resetting suggestions. Errors returned to the model/UI omit the underlying path and exception text.

From1.14, fitting complete text is sequentially read before one extraction call. From1.15, larger complete text up to40000 serialized UTF8 bytes/eight segments can use durable provisional notes, followed by one final synthesis. Each segment and final call counts toward the same daily budget/cooldown; only final synthesis may write core memories. `reflectionWorker.lastResult.materialRead.kind` distinguishes full-archive/segment/segmented-synthesis; segment index/total and safe public job `segmentProgress` show progress. Internal notes are omitted from public detail. No cross-turn batching yet.

`needs_review` may mean waiting for the next segment/final synthesis, a missing/incomplete/too-large archive, or an explicit/dense-note/context-budget review block. A staged note releases the lease without spending a failure attempt. Cancellation preserves confirmed notes; failures use existing bounded attempts. A checkpoint already saved before budget-log interruption is recovered as staged; an unconfirmed call retains its budget and may need repeating. All allowed note bytes are reserved before segment calls. If core context grows or newly selected memories make final synthesis too large, it parks explicitly without another request or lost notes. A blocked batch is not automatically retried: inspect full text through existing material tools or skip with a reason. Do not edit queue progress by hand. Changed core versions reject final submission (including empty results) without losing notes; a later budgeted synthesis uses a fresh snapshot.

Default cooldown is10 minutes and budget6 calls per UTC day. A five-segment batch plus synthesis uses six calls and at least50 minutes without competition; insufficient remaining budget carries progress to the next UTC day. The isolated test advances only its own clock, not system time or formal budgets. Explicit test: `npm run test:live-material -- --run-live --segmented --exe "<DSH executable>"`; `--resume <existing isolated root>` resumes only a verified temporary fixture. Segmented drivers intentionally end with blocked/code1 after their worker tick, before any foreground model/tool step; ordinary capture/recall dialogues must complete normally. Inspect actual inputs/outputs, sources and fresh recall separately from structural checks. Use the existing CA environment if required; never disable TLS verification.

| Code | Stage | Response |
|---|---|---|
| MAINTENANCE_INVALID_JOB | input | inspect the captured job identifier |
| MAINTENANCE_INVALID_PROPOSAL | input | correct allowed structure/count/size |
| MAINTENANCE_INCOMPLETE_CONTEXT | context | use a smaller complete set, do not infer missing bodies |
| MAINTENANCE_CONTEXT_CHANGED | context | reread targets, all current children and evidence |
| MAINTENANCE_FORBIDDEN_OPERATION | policy | remove body rewrites or unsupported operations |
| MAINTENANCE_UNREAD_TARGET | policy | read the target completely; never operate on self through proposals |
| MAINTENANCE_PREVIEW_REJECTED | preview | check core/evidence/empty-branch rules using normal preview |
| MAINTENANCE_STORAGE_INVALID | storage | inspect/repair from backup; no automatic reset |
| MAINTENANCE_STORAGE_FAILED | storage | check directory/disk, then reread |
| MAINTENANCE_INTERNAL | internal | reproduce in isolation; public reason omits arbitrary error text |

Do not log credentials, raw upstream errors or formal chat text. Existing reflection source-role error codes remain supported. For TLS `TRANSPORT`, first distinguish the underlying connection error; the prior incident was missing inheritance of an already configured user CA. The plugin does not change trust stores, disable TLS checks, or manage host login. Normal desktop startup after fixing environment inheritance was verified by the user.

## Real model acceptance (opt-in, chargeable)

CI never calls a real model. Use the installed DSH executable and its existing account; keep normal user preferences out of test workspaces. If this host needs the already configured user CA, inherit its existing setting only for the test process; do not disable verification.

```powershell
$env:NODE_EXTRA_CA_CERTS = [Environment]::GetEnvironmentVariable('NODE_EXTRA_CA_CERTS', 'User')
node plugin/patches/live-maintenance-dialogue.mjs --run-live --exe 'E:\App\deepseek harness\DeepSeek Harness.exe'
# Use the actual dialogue.json path printed by the successful first command:
node plugin/patches/live-background-maintenance.mjs --run-live --exe 'E:\App\deepseek harness\DeepSeek Harness.exe' --seed-report 'C:\...\love-live-maintenance-...\dialogue.json'
Remove-Item Env:NODE_EXTRA_CA_CERTS
```

The first runner creates model-authored fixture cores, reviews/previews/commits, preserves historical legacy text and checks a fresh-session recall. The second validates the actual first-round snapshot hash, asks for a nonexecuting reorganization suggestion in a new temporary workspace, drives one real worker call, reads it, re-previews/commits the same proposal, then recalls in another session. No hardcoded formal workspace or temporary-run ID is required.

Inspect the **actual tool results, files, source references, saved proposal, preview/commit and answer**, not just the final sentence. `structuredChecksPassed` excludes semantics; semantic review stays pending until an explicit manual audit. Save failures too; do not silently loop until one pass. `worker-raw.json` contains only visible worker JSON/input from this isolated fixture, never reasoning deltas. Its path marker check prevents normal installation from loading the test fixture.

## Install and recover

After a green full gate, run from the repository:

```powershell
node plugin/patches/deploy.mjs --skip-tests
```

Only `node_modules/dsh-memory-network` targets are accepted, and source/target overlap or directory links are rejected. Files are copied and fully hashed in a sibling staging directory before the existing target is renamed to a backup. The new target is checked again; rename/post-install failures restore the old target. Backups are retained (default8), cleanup failure is a warning after successful installation. No workspace memory is touched. The fault suite tests both pre- and post-replacement failure paths.

Normally exit DSH via its application menu, confirm the old process has exited, then start it from the user's normal desktop route so its existing environment is inherited. Check API version, all installed source hashes, graph counts/core revision, queue/budget and native panel/zoom. Ports change on restart; use the panel's current star link. If the user is actively using/minimizing the window, coordinate before native input; never force kill their session for a smoke check.

If code must be restored:

```powershell
node plugin/patches/deploy.mjs --rollback
```

Rollback stages the latest backup and creates a backup of the current installation, then uses the same replacement checks. It restores plugin code, not memory. If a Windows lock prevents renaming, leave the backup intact and report the exact recovery result. An actual restored prior version remains subject to its own data compatibility; this maintenance version introduces no schema change.

Every delivery records local checks, real-model limitations, backup/install/restart evidence, commit and corresponding successful CI. Resume feature work only after the maintainability evaluation passes the user's >9.0 gate.
# 1.16.0 记忆边界与恢复补充

- 用户/管理员可在插件配置或运行时配置中设置`memoryReadOnly: true`，或`memoryReadOnlySessionIds: ["完整会话ID"]`。默认关闭。它限制本插件模型显式写入及受保护会话自动收集/整理，不是宿主工具或文件系统沙箱；面板管理属于管理员操作，受保护会话心情/召回查询不会写回心情、关系、自我或语音提示状态；独立心跳与管理员面板不会因此冻结。
- 整理面板查看批次原因、已读段数和核心提交回执。缺附件/缺旧快照/超过40KB或8段不会仅因等到次日自动恢复；需提供可核对的完整文字。分段阻断先查看原材料，补充完整精简文字，确认新材料已接收后再说明理由跳过旧批次。
- 每日预算以UTC日重置（中国时间08:00）；界面显示当地的下次可用时间，仍受冷却、连接和轮询影响。后台限额与前台工具调用分开计算，重启不重置预算。
- 升级时先正常退出DSH，备份后用`sanitizeReflectionQueue(workspace, groupId)`窄范围脱敏旧队列。备份名`reflection-queue.json.privacy-backup-*`，原值仍在本地备份/宿主会话中，不要上传。受影响的旧租约和阅读回执失效，重新读脱敏材料；已提交的核心事实和回执保留。重复运行不会增加队列版本。
- 历史部署若依赖旧的NapCat目录配置，安装前迁移现有配置到用户目录`.dsh/love-companion.json`并校验，保留通道身份及设置，避免隐私清理后的默认路径改变导致功能丢失。不要将本机身份重新硬编码进源码。

