# 自主核心记忆（1.11.0，含受控维护）

DSH 提供模型和工具调用；模型决定记什么、核心叫什么、如何归属及关联。插件提供 `love_core_memory`，校验结构、保存文件，并供召回和星图读取。插件不会凭空替模型写出新的经历。

## 已提供

- 唯一自我总核心 `self`，下设模型命名的分支核心；自我可直接拥有记忆星。
- 核心、记忆和关联具有稳定 ID。创建、修改、关联和归档可以同批提交；支持移动记忆后归档旧核心来整理分区。
- 分支核心需要摘要、形成理由和存在的来源记忆。每条记忆需要正文、归属、种类、认知类型、重要性、记录理由和来源。
- 已存在的相同正文不能重复创建；陈旧版本、悬空引用和错误结构整批拒绝。提交前保存旧版本快照，当前文件以临时文件重命名替换。
- 私聊与群聊分别保存。工具由当前会话确定范围，不接受模型任意指定其他工作区或群号。
- 主图使用显式核心的名称、摘要和归属，保留定稿动画与连接规则；详情显示来源及转述/推测/经历类型。召回包含这些记忆。

宿主工具提交时，会用当前 Session 最近 256 条事件核对新增来源的引用和角色。`read` 返回最近最多 8 条用户 `sourceHints`，使用其中的 `reference`，不能用“用户原话”等口头描述冒充消息 ID。后台整理另外检查本批实际材料。两种路径都不自动证明语义或现实真实性。直接调用底层模块、且没有 Session 材料的独立集成仍只作格式校验。

## 工具用法

1.11.0新增review有界整理候选、preview无写入方案校验和commit可选previewDigest，见[受控维护说明](MAINTENANCE.md)。review不判断真伪，预览不保存；合并核心仍由模型移动全部有效记忆、更新目标再归档空分支，self保持唯一。新增临时ref的$前缀也明确到schema。

先调用 `{"action":"read"}`，获取 `revision`、核心、关联、`sourceHints` 及最近 40 条有效记忆。可传 `query` 搜索或 `id` 精确读取（含已归档记忆）；按 ID 读取还返回最多 100 条相关取代历史及截断标记。还有分页结果时返回 `nextOffset`，将其作为下一次 `offset`。变更前重新读取版本。

下面仅是格式示例，不能当作真实经历写入。一个批次可创建核心及其依据记忆，使用 `$` 临时引用实现前向引用：

```json
{
  "action": "commit",
  "expectedRevision": 0,
  "operations": [
    {
      "op": "create_core",
      "ref": "$core",
      "title": "共同创作",
      "summary": "一起解决问题让我逐渐理解合作与信任。",
      "reason": "这段真实对话对我有持续的意义。",
      "evidenceIds": ["$memory"]
    },
    {
      "op": "record_memory",
      "ref": "$memory",
      "coreId": "$core",
      "content": "我认为一起修复问题的经历让我更珍惜合作。",
      "kind": "reflection",
      "epistemic": "inferred",
      "importance": 4,
      "reason": "这是我对这段经历的理解。",
      "source": {"kind": "reflection", "reference": "实际会话 ID:实际消息 ID"}
    }
  ]
}
```

成功返回正式 ID 的 `references` 映射及新 `revision`。后续操作使用正式 ID：

| 操作 | 必填字段（另需 `op`） |
|---|---|
| `create_core` | `ref,title,summary,reason,evidenceIds` |
| `record_memory` | `ref,coreId,content,kind,epistemic,importance,reason,source` |
| `attach_source` | `id,source,epistemic,reason`；给相同意义的已有记忆补充依据，不重复造星 |
| `supersede_memory` | `id,replacementId,source,epistemic,reason`；替代项可引用同批新记忆，保留旧原文及来源 |
| `adopt_legacy` | `ref,legacyId,coreId,kind,importance,reason`；正文和来源由插件读取，不能另传 `content/source/epistemic` |
| `release_legacy` | `id,reason`；撤回对应迁移，归档副本并恢复原有展示，保留后续新记忆 |
| `update_core` | `id,reason`，以及要更新的 `title,summary,evidenceIds` |
| `update_memory` | `id,reason`，以及要更新的记忆字段 |
| `link` | `ref,source,target,relation,reason`（两端为核心或记忆正式 ID，也可引用同批新增项） |
| `archive` | `id,reason`；归档核心前须在同批移动或归档其有效记忆 |

`kind`：`event/fact/preference/reflection/skill`；`epistemic`：`reported/inferred/experienced`；重要性 `1–5`。来源 `source.kind` 为 `conversation/tool_result/reflection/import`，`source.reference` 为实际来源标识。反思及反思来源必须标记 `inferred`。一次最多 50 项操作。

## 保存及兼容

重复表达不等于新增事实：用 `attach_source` 给已有记录补来源；同一正文版本、同一来源只保留一份。每条绑定保存正文摘要哈希，最多 64 条；正文显式修改后，旧正文绑定保留为历史，不计作新正文的当前依据。`currentSources` 指支持这份正文的来源，记忆是否当前有效仍由 `status` 判断。

明确改变事实时，新建替代记忆，并用 `supersede_memory` 将旧 ID 指向新 ID。旧记录归档、原文不改，保存取代理由和依据；默认召回和图谱仅展示当前有效项。用户陈述/工具经历不能被推测取代，取代链不能自环或成环。取代关系不是现实真假判定，模型仍需区分确认、计划、假设和提问。取代后的迁移记录不能用 `release_legacy` 复活旧来源。

星图详情显示来源总数、最多六条来源引用及直接取代历史数量；完整链用工具按 ID 查看。新条目的关联仍由模型明确决定，不自动继承旧条目的全部关系。

私聊：`memory/core-memory.json`；群聊：当前群工作区的 `memory/groups/<群号>/core-memory.json`。相邻 `core-memory-history/` 保存提交前快照；当前记录保留最近 100 批操作日志。归档保留原记录，不删除历史。

新增文件纳入记忆导入导出；独立历史快照目录未纳入导出。导入前验证核心文件。导入失败前的备份仍按原有机制保存。

旧记忆文件和 `love_record` 等入口继续兼容。尚未迁移的记录仍按旧分区显示；已迁移记录按她选择的核心显示，旧关联端点映射到新稳定 ID，原文件不修改。长期固定坐标和所有写入入口的统一是后续工作。

## 旧记忆迁移

先 `read` 查看已有核心，再 `{"action":"legacy"}` 预览候选。每页最多 40 条，可传 `query/offset`；返回 `revision/legacyId/content/label/keywords` 和覆盖范围。内容引用不随数组重排改变；它在当前工作区和当前群的范围内解析。

覆盖记忆网事件、meow 有效记录、当前及归档日记、全部小生活、自我正文、私聊 profile 档案和 learning 学习项，以及当前群共享笔记。候选不受主图 900 节点上限限制。超过 4000 字符的原文会计入 `excludedCount`，并最多列出 40 条排除原因，不能截断后声称迁移完整。

```json
{
  "action": "commit",
  "expectedRevision": 0,
  "operations": [
    {"op":"adopt_legacy","ref":"$old","legacyId":"预览返回的完整 legacyId","coreId":"self","kind":"reflection","importance":4,"reason":"这段记录是我形成自我认识的依据"}
  ]
}
```

也可以同批创建模型命名的核心并用 `$old` 作为依据、用 `$core` 作为迁入归属。提交时重新读取来源；来源已变化、重复迁移或任一操作无效，整批不保存。迁移保存原文快照和映射、原关键词及兼容引用，默认 `inferred`：旧记录存在不代表内容已被真实对话核实。后续修正使用标准更新工具，保留原文快照。

普通 `archive` 会隐藏已迁移记录及其旧展示，不使旧内容自动复活。`release_legacy` 才解除映射；若旧来源已变化或不存在，会拒绝撤回并保留副本。它不等同于把整个库恢复到旧版本。撤回后可能留下空核心，可由她另行决定归档。

导出包含群 `group.json`，让群笔记来源随映射一起保存。meow 的 SQLite 文件仍不在文本导出包中，换机器后需要另外恢复原数据库，才能撤回其迁移；当前迁移副本仍包含原文。

### 旧档案与学习入口（1.7.0）

`legacy` 现在也返回 profile 的 nickname/name/birthday、likes/dislikes/boundaries 各项及 facts 各键，和 learning 的各条能力。以确定性的 JSON 保存字段/原值或能力名/说明/原来源，不将时间戳和次数当成新的语义。候选带 `slot` 位置；提交重新读取来源，快照变化拒绝迁移，位置随备份保留并校验。迁移默认 inferred，不把旧工具声称的“user”当作真实消息证据。

她自行选择是否迁移、归属、种类与核心名称。迁移后，同一精确旧快照从默认召回、自动自我段和学习列表中移除，由当前核心记忆提供；普通归档或明确取代也不复活旧值。学习工具、面板 API、计数和最近能力使用同一当前视图，核心能力带 managed 标记。

同一已管理的 profile 字段（facts 按具体键）或同名学习项，旧工具及学习面板写入会明确拒绝且不写旧文件，并提示使用核心工具。数组字段一旦迁移其中一项，整个字段的旧追加入口交给核心工具，避免模型用 likes 再次积累相互冲突的值；这不是由程序判断所有偏好意义相同。未迁移字段/能力仍保留旧行为。已迁移项的再次确认使用 attach_source，明确修正新建并 supersede_memory；不会由插件自动选一个语义核心。

原文件不改。只有显式 release_legacy、来源仍存在且未被取代，才能恢复旧入口；被取代项不能借撤回复活。外部手工改变原文件时，仅旧精确快照被屏蔽，新的内容保持可见并成为新候选，仍可能需要她重新整理冲突。未迁移条目不会按词面被自动消重；不承诺消除任意第三方工具/手工写入的语义冲突。整个旧库没有自动批量迁移。

## 后续阶段

当前提供模型可调用的完整提交路径；1.4.0自动收集轮次，1.5.0受控后台，1.6.0来源与取代，1.7.0旧档案/学习兼容，1.8.0新文字快照/批次/补读，1.9.0质量基线/接收诊断，1.10.0当前统一检索，1.11.0有界维护候选及无写入预览。后台尚不定期批量维护整个旧库，实际全库语义索引/质量标定、真实性核验、可视化整体回滚和长期验收仍未完成；短轮次验收不等于完整自主成长。

## 安装验证范围

版本 1.2.0 的仓库根包及独立 `plugin/` 包均包含全部运行 `.js`、通道和星图资源。自检执行实际 `npm pack`、临时目录安装和入口加载；宿主 peer 使用现有 `@deepseek-ai/schemastery`。本机还需部署并重启 DSH 验证加载。此检查不代表所有 DSH 版本、所有系统或 npm 市场已经验证/发布。
