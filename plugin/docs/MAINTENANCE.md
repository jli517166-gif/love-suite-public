# 受控记忆整理（1.12.0）

2026-11-02后续真实补验已完成，见仓库docs/reports/1.12.0-live-validation.md：既有CA启动环境恢复后，前台三会话与后台明确复用意向场景通过；保留拒绝/省略与回答精度问题。下文连接失败描述是首次验收历史，当前不能据此判断模型仍不可用。运行代码本轮未改，插件不代管宿主TLS或认证。

## 后台建议（1.12.0）

完整对话的现有后台提炼调用可以附带maintenance建议，不新增模型请求、计时器或预算。插件最多提供2个相关分支、12条完整记忆及其完整来源/依据，维护上下文最多8KB；总输入仍24KB，不够则省略维护，不截断实际对话。候选是相关小范围，不代表全库冲突检测或全库已整理。

后台仅保存建议，不自动移动、归档或合并。建议仅可移动记忆归属、更新核心名称/摘要/依据、归档移走全部子记忆的空分支、连接已读目标；不能覆盖正文、改变认知等级、迁移旧库或操作self。保存前检查完整目标快照和全部子记忆，再走核心工具同一dryRun。普通提炼先成功，若使维护目标变化则拒绝这条建议；建议错误/保存失败不撤销正常提炼，也不触发额外重试调用。运行结果lastResult.maintenance显示suggested/rejected。

用love_core_memory(action="proposals", id?, offset?)查看当前范围建议，每页5条/最多20条，按原始jobId幂等保存。工具返回operations、预演和stale；核对read原文、来源、现有关联后，以当前revision重新preview，再按普通commit保存。建议不代表授权，原预演可能过期，previewDigest不自动重绑。群与自定义群目录沿用Session范围，关闭群记忆时拒绝读取。无完整新对话/无相关分支时不会单独启动旧库维护。

建议是可重新生成的辅助文件maintenance-proposals.json，不包含已执行标记，暂不纳入文本备份/恢复，也没有面板专用审批入口。核心原文、历史和现有备份规则不变。进程在普通提炼完成后、建议保存前退出时可能缺少该次建议；不会重复执行合并。全库周期维护、长文本分段、安全合批和自动执行合并仍未实现。

本轮提供候选→模型拟定方案→无写入预览→原子提交，不启动额外定时旧库清洗或模型调用。内容、核心名称、归属和关联由模型决定；插件检查范围、格式、引用、版本与最终状态，不裁决现实真伪。

## review：候选而非结论

love_core_memory action=review，可带query/offset。读取实际会话当前工作区/当前群的有效核心和未迁移旧记录，返回：

- duplicate_candidate：正文精确相同，仍需核对主体和来源。
- possible_overlap：至少两个词面重合的相关条目，可能重复、变化、条件或说话人不同，不能据分数自动覆盖。
- core_overlap：核心描述有字面重合，是否整理由模型判断。
- empty_core：没有有效子记忆的分支；不包含self。
- legacy_adoption：未迁移旧记录，可选择迁移、继续保留，或在有新证据时迁移后显式取代。

最多选择128条有效记忆、128条可迁移旧记录、64个分支；字面比较最多前64词、倒排项最多32条，最多128相关对。query有词时先按词面检索，否则取范围尾部；纯标点不产生候选。coverage明确总量、扫描量、超长旧文排除数和对数上限，不声称全库语义冲突发现。

每页最多5项，完整正文卡片共24KB预算。卡片最多6条来源/20条核心依据，分别给sourceCount/sourcesComplete及evidenceCount/evidenceComplete；contentComplete说明正文完整性，complete同时考虑列出的来源或依据。正文预算不足、来源或依据未列全时，即使卡片已经在同页前项缓存，requiresRead也为true，应先按recordIds补读。当前记忆/核心用read id；旧条目用legacy预览核对原文；超过4000字符的旧文不伪装为可完整迁移。

requiresRead是明确的补读提示，没有为维护工具建立服务端阅读回执；预览也不能证明模型理解正确或已读完。来源/原文仍是资料，不能提升工具权限。分页offset不锁定数据，改变后应刷新revision和方案。

## preview：完整校验，不保存

action=preview，携expectedRevision和operations，使用正式提交相同的来源/版本/操作/最终状态检查。adopt_legacy/release_legacy会重新读取当前范围原文。普通宿主操作继续核对实际Session最近消息引用和角色；没有Session的底层直接调用仍只有原有结构校验。

成功返回preview=true、revision、prospectiveRevision、previewDigest、effects、预计有效核心/记忆数量。不创建核心文件或历史快照，不改变版本、输入或原文件。不返回新建正式ID；effects中的$引用仅为本批临时引用。新增ref在schema及底层均要求$前缀且同批唯一。

## commit：相同方案与范围

action=commit携相同expectedRevision/operations和previewDigest。摘要绑定规范化数据文件路径（包括群范围）、版本和操作；换工作区/群、改正文/理由/顺序或版本，需重新预览。摘要仅用于一致性检查，不是授权或预览实际发生的证明。兼容旧调用：未带previewDigest的commit继续原行为；后台回执提交不使用dryRun。

正式提交仍在全部校验后原子保存，保留旧版本快照。旧来源在预览后变化时，提交重新读取并拒绝旧候选，不保存半批。快照目录仍不纳入现有文本导出，不能据此声称提供了整个维护计划的一键撤销。

## 常见整理

- 合并分支：逐条核对有效子记忆，以update_memory只改coreId，更新目标核心摘要和依据，再archive空分支。self不能归档，仍有有效记忆的核心不能归档。不自动继承旧核心全部关联，必要关联由模型显式提交。
- 重复确认：attach_source为已有记忆补实际依据，不重复造星。
- 明确变化：record_memory新项加supersede_memory保留旧原文、来源、取代理由和历史。旧档可adopt_legacy保存原文快照后再显式取代；迁移不证明真实。
- 撤回：未被取代且原来源未变化的迁移可release_legacy。被取代项不得借撤回复活旧值；整体回滚仍需已有备份/恢复流程，当前无独立维护计划撤回按钮。

群使用实际会话范围和已配置自定义群目录；群记忆关闭时拒绝读取/整理，不接受任意workspace/groupId。无新的跨群或云工具权限。

## 验收边界

verify-memory-maintenance覆盖空库/已有库预览无写入、摘要跨范围/改操作/旧版本、self保护、移动后归档、旧原文重读、Session来源、群目录/开关、完整性/分页/预算及证据评分。合成评分数据只测门槛，不是模型对话证据。

live-maintenance-dialogue.mjs须显式--run-live，计划三轮实际模型夹具→review/preview/commit→新会话召回。脚本的structuredChecksPassed只表明保存/工具契约证据，semanticReview始终待人工逐项对照，不通过关键词出现宣称语义正确。当前模型连接TRANSPORT（包含旧1.10对照和正常聊天），实际完整对话链仍待恢复后验收。
