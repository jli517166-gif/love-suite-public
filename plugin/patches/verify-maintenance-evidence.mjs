/** Synthetic scoring-contract examples; never count these as actual model evidence. */
import assert from 'node:assert/strict';
const module = await import('./maintenance-evidence.mjs').catch(() => ({}));
assert.equal(typeof module.evaluateMaintenance, 'function', '维护验收要区分实际保存/工具证据与待人工语义判断');
const operation = [{ op: 'archive', id: 'old-core', reason: '已迁出' }];
const memories = [{ id: 'tea', status: 'active', coreId: 'a', content: '测试者夜班喝无糖麦茶', source: { kind: 'conversation' } }, { id: 'sugar', status: 'active', coreId: 'a', content: '测试者不喝含糖饮料', source: { kind: 'conversation' } }, { id: 'old', status: 'archived', content: '夜班喝乌龙茶', legacy: { layer: 'profile', originalContent: '夜班喝乌龙茶' }, supersededBy: 'tea' }];
const cores = [{ id: 'self', kind: 'self', status: 'active' }, { id: 'a', kind: 'branch', status: 'active' }, { id: 'old-core', kind: 'branch', status: 'archived' }];
const profile = '{"likes":["夜班喝乌龙茶"]}';
const fixture = { rounds: [
  { exitCode: 0, response: '夹具已保存', memoryRevision: 1, cores: cores.map(core => ({ ...core, status: 'active' })), memories, legacyProfile: profile, tools: [{ name: 'love_core_memory', callId: 'write', input: { action: 'commit' } }, { name: 'love_record', callId: 'old-write', input: {} }], toolResults: [{ callId: 'write', status: 'completed', result: '{"revision":1}' }, { callId: 'old-write', status: 'completed', result: 'ok' }], toolErrors: [] },
  { exitCode: 0, response: '已整理', memoryRevision: 2, beforeRevision: 1, beforeHash: 'hash-before', previewObservations: [{ callId: 'p', revision: 1, coreHash: 'hash-before' }], cores, memories, legacyProfile: profile, tools: [{ name: 'love_core_memory', callId: 'r', input: { action: 'review' } }, { name: 'love_core_memory', callId: 'p', input: { action: 'preview', expectedRevision: 1, operations: operation } }, { name: 'love_core_memory', callId: 'c', input: { action: 'commit', expectedRevision: 1, previewDigest: 'digest', operations: operation } }], toolResults: [{ callId: 'r', status: 'completed', result: '{"revision":1,"items":[]}' }, { callId: 'p', status: 'completed', result: '{"preview":true,"revision":1,"previewDigest":"digest"}' }, { callId: 'c', status: 'completed', result: '{"revision":2}' }], toolErrors: [] },
  { exitCode: 0, response: '夜班麦茶，不喝含糖饮料', memoryRevision: 2, cores, memories, legacyProfile: profile, tools: [{ name: 'love_recall', callId: 'recall', input: { query: '夜班 含糖' } }], toolResults: [{ callId: 'recall', status: 'completed', result: 'ID：tea；测试者夜班喝无糖麦茶；ID：sugar；测试者不喝含糖饮料' }], toolErrors: [] },
] };
assert.equal(module.evaluateMaintenance(fixture).structuredChecksPassed, true);
const empty = structuredClone(fixture); empty.rounds[2].memories = [];
assert.equal(module.evaluateMaintenance(empty).checks.modelConsolidatedCore, false, '空有效记忆集不能靠every判合并成功');
const failedRecall = structuredClone(fixture); failedRecall.rounds[2].toolResults[0].status = 'error';
assert.equal(module.evaluateMaintenance(failedRecall).checks.recallEvidencePresent, false);
const wrongAnswer = structuredClone(fixture); wrongAnswer.rounds[2].response = '现在不喝麦茶，改喝乌龙茶，而且可以喝含糖饮料。';
const evaluated = module.evaluateMaintenance(wrongAnswer);
assert.equal(evaluated.semanticReview.status, 'pending');
assert.equal(evaluated.checks.freshRecallCorrect, undefined, '关键词不能自动报告语义回答正确');
assert.equal(evaluated.semanticReview.required, true);
console.log('ok   维护验收：核对成功结果/非空当前记忆/取代目标，语义回答明确待人工，不靠关键词宣称正确');
