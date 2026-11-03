import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { commitCoreMemory, coreMemoryFile, readCoreMemory } from '../core-memory.js';
import { auxiliaryLegacyNodes, legacyCandidates } from '../legacy-memory.js';
import { createHash } from 'node:crypto';
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'love-maintenance-'));
const memory = (ref, content, coreId = 'self') => ({ op: 'record_memory', ref, coreId, content, kind: 'preference', epistemic: 'reported', importance: 3, reason: '隔离维护测试', source: { kind: 'conversation', reference: 'fixture#user' } });
try {
  const input = { expectedRevision: 0, operations: [memory('$first', '测试者夜班喝麦茶')] };
  const originalInput = structuredClone(input);
  const preview = commitCoreMemory(workspace, input, { dryRun: true });
  assert.equal(fs.existsSync(coreMemoryFile(workspace)), false, '预览不能创建核心文件');
  assert.equal(fs.existsSync(path.join(workspace, 'memory/core-memory-history')), false);
  assert.equal(preview.preview, true);
  assert.equal(preview.revision, 0);
  assert.equal(preview.prospectiveRevision, 1);
  assert.equal(preview.references, undefined, '预览不返回不能沿用的新建正式ID');
  assert.deepEqual(input, originalInput);
  assert.throws(() => commitCoreMemory(path.join(workspace, 'other-scope'), { ...input, previewDigest: preview.previewDigest }), /预览.*不一致/, '预览摘要不能在另一工作区复用');
  assert.throws(() => commitCoreMemory(workspace, { ...input, previewDigest: preview.previewDigest }, { groupId: '12345678' }), /预览.*不一致/, '预览摘要不能在另一群范围复用');
  assert.throws(() => commitCoreMemory(workspace, { ...input, operations: [memory('$first', '偷偷改变正文')], previewDigest: preview.previewDigest }), /预览.*不一致/);
  const first = commitCoreMemory(workspace, { ...input, previewDigest: preview.previewDigest });
  assert.equal(first.revision, 1);
  assert.throws(() => commitCoreMemory(workspace, { ...input, previewDigest: preview.previewDigest }), /版本/);
  assert.throws(() => commitCoreMemory(workspace, { expectedRevision: 1, operations: [{ op: 'archive', id: 'self', reason: '不能归档自我' }] }, { dryRun: true }), /唯一/);
  console.log('ok   维护预览：不写文件/历史、不改输入、不暴露新正式ID，摘要绑定方案与版本');
  const review = await import('../memory-review.js').catch(() => ({}));
  assert.equal(typeof review.reviewMemoryCandidates, 'function', '需要只读有界维护候选');
  const legacyGraph = { nodes: auxiliaryLegacyNodes({ likes: ['夜班喝乌龙茶'] }), links: [] };
  const second = commitCoreMemory(workspace, { expectedRevision: 1, operations: [
    { op: 'create_core', ref: '$a', title: '夜班饮品', summary: '关于夜班饮品的习惯', reason: '测试分区', evidenceIds: [first.references.$first] },
    { op: 'create_core', ref: '$b', title: '饮品边界', summary: '关于饮品的边界', reason: '测试分区', evidenceIds: ['$sugar'] },
    { op: 'update_memory', id: first.references.$first, coreId: '$a', reason: '归入分支' }, memory('$sugar', '测试者不喝含糖饮料', '$b'),
  ] });
  const store = readCoreMemory(workspace), before = fs.readFileSync(coreMemoryFile(workspace), 'utf8');
  const candidates = review.reviewMemoryCandidates(store, legacyGraph);
  assert.equal(candidates.revision, 2);
  assert.ok(candidates.items.some(item => item.kind === 'legacy_adoption'));
  assert.ok(candidates.items.some(item => item.kind === 'possible_overlap'), '字面相关只能提示，不自动裁决真假');
  assert.ok(candidates.records.every(item => item.complete === true));
  assert.equal(fs.readFileSync(coreMemoryFile(workspace), 'utf8'), before);
  const richSources = structuredClone(store), richId = richSources.memories[0].id;
  const contentHash = createHash('sha256').update(richSources.memories[0].content.replace(/\r\n/g, '\n').trim()).digest('hex');
  richSources.memories[0].sources = Array.from({ length: 7 }, (_, i) => ({ kind: 'conversation', reference: 'fixture#source' + i, epistemic: 'reported', contentHash, reason: '多个真实来源夹具' }));
  const richView = review.reviewMemoryCandidates(richSources, { nodes: auxiliaryLegacyNodes({ likes: ['夜班喝乌龙茶', '测试者夜班喝红茶'] }), links: [] });
  const reused = richView.items.filter(item => item.recordIds.includes(richId));
  assert.ok(reused.length >= 2);
  assert.ok(reused.every(item => item.requiresRead), '来源不完整时，重复使用已缓存卡片的候选也必须补读');
  const richEvidence = structuredClone(store);
  richEvidence.cores[1].evidenceIds = Array(21).fill(richId);
  assert.ok(review.reviewMemoryCandidates(richEvidence, { nodes: [], links: [] }).items.filter(item => item.recordIds.includes(richEvidence.cores[1].id)).every(item => item.requiresRead), '核心依据不完整时必须补读');
  const merge = { expectedRevision: 2, operations: [
    { op: 'update_memory', id: second.references.$sugar, coreId: second.references.$a, reason: '模型决定归入同一分区' },
    { op: 'update_core', id: second.references.$a, summary: '夜班饮品和含糖边界', evidenceIds: [first.references.$first, second.references.$sugar], reason: '更新含义' },
    { op: 'archive', id: second.references.$b, reason: '已移出全部有效记忆' },
  ] };
  assert.throws(() => commitCoreMemory(workspace, { expectedRevision: 2, operations: [{ op: 'archive', id: second.references.$b, reason: '未移动不能归档' }] }, { dryRun: true }), /归属/);
  const prepared = commitCoreMemory(workspace, merge, { dryRun: true });
  assert.equal(prepared.activeCores, 2);
  assert.equal(fs.readFileSync(coreMemoryFile(workspace), 'utf8'), before);
  commitCoreMemory(workspace, { ...merge, previewDigest: prepared.previewDigest });
  assert.equal(readCoreMemory(workspace).memories.find(m => m.id === second.references.$sugar).coreId, second.references.$a);
  const old = legacyCandidates(legacyGraph, store).candidates[0];
  const adopt = { expectedRevision: 3, operations: [
    { op: 'adopt_legacy', ref: '$old', legacyId: old.legacyId, coreId: second.references.$a, kind: 'preference', importance: 2, reason: '保存旧档案原文' },
    { op: 'supersede_memory', id: '$old', replacementId: first.references.$first, source: { kind: 'conversation', reference: 'fixture#now' }, epistemic: 'reported', reason: '明确当前夜班饮品已经改变' },
  ] };
  const oldPreview = commitCoreMemory(workspace, adopt, { dryRun: true, legacyCandidates: [old] });
  commitCoreMemory(workspace, { ...adopt, previewDigest: oldPreview.previewDigest }, { legacyCandidates: [old] });
  const after = review.reviewMemoryCandidates(readCoreMemory(workspace), legacyGraph);
  assert.ok(!after.records.some(record => record.id === old.legacyId));
  assert.ok(!after.items.some(item => item.kind === 'legacy_adoption'));
  const longGraph = { nodes: [{ id: 'long', layer: 'life', content: '长'.repeat(4001) }], links: [] };
  assert.equal(review.reviewMemoryCandidates(store, longGraph).coverage.excludedLongLegacy, 1);
  const manyGraph = { nodes: Array.from({ length: 140 }, (_, i) => ({ id: 'l' + i, layer: 'life', content: `独立迁移原文${i}` })), links: [] };
  const bounded = review.reviewMemoryCandidates(store, manyGraph);
  assert.equal(bounded.coverage.legacyScanned, 128);
  assert.equal(bounded.coverage.legacyTotal, 140);
  assert.ok(bounded.items.length <= 5 && Buffer.byteLength(JSON.stringify(bounded)) <= 26000);
  assert.equal(bounded.nextOffset, 5);
  const nextPage = review.reviewMemoryCandidates(store, manyGraph, { offset: bounded.nextOffset });
  assert.ok(nextPage.items.every(item => !bounded.items.some(previous => previous.id === item.id)));
  assert.equal(review.reviewMemoryCandidates(store, manyGraph, { query: '？！' }).items.length, 0);
  console.log('ok   有界候选及整理：只读、相关不裁决、迁移过滤、正文/分页覆盖；预览后移动/归档及旧档案取代保持原文');
  const oversized = structuredClone(store);
  oversized.memories[0].content = '夜班习惯与饮品'.repeat(550).slice(0, 3980);
  oversized.memories[1].content = '夜班习惯与饮品'.repeat(550).slice(0, 3979) + '别';
  assert.ok(review.reviewMemoryCandidates(oversized, { nodes: [], links: [] }).items.some(item => item.requiresRead));
  const put = (relative, data) => { const file = path.join(workspace, relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(data)); };
  process.env.LOVE_TEST_ISOLATED = '1'; process.env.LOVE_COMPANION_CONFIG = path.join(workspace, 'runtime.json');
  put('memory/profile.json', { likes: ['晚饭只喝温水'] });
  put('custom/memory/groups/12345678/group.json', { notes: [{ text: 'CUSTOM_GROUP共享记忆' }], members: {} });
  const runtime = { workspace, channel: 'none', proactiveEnabled: false, reflectionBackgroundEnabled: false, groupWorkspaces: { '12345678': path.join(workspace, 'custom') } };
  put('runtime.json', runtime);
  const { apply } = await import('../index.js');
  const tools = new Map();
  const dispose = await apply({ tools: { register(tool) { tools.set(tool.name, tool); } }, on() {}, logger: { info() {}, warn() {} } }, runtime);
  const execution = (id = 'maintenance-session') => ({ agent: { session: { id, seq: 2, header: { cwd: workspace }, snapshotEvents: () => [{ type: 'user/message', seq: 1, data: { id: 'u', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '测试者现在夜班喝麦茶' }] } }] } } });
  const call = async (args, id) => JSON.parse((await tools.get('love_core_memory').execute(args, execution(id))).text);
  try {
    const refSchema = tools.get('love_core_memory').parameters.properties.operations.items.oneOf.find(item => item.properties.op.const === 'record_memory').properties.ref;
    assert.ok(new RegExp(refSchema.pattern || '').test('$valid') && !new RegExp(refSchema.pattern || '').test('missing-prefix'), '临时引用schema应明确$前缀，减少真实对话中反复出现的格式错误');
    const view = await call({ action: 'review' });
    assert.ok(Array.isArray(view.items), '实际工具必须提供维护候选而不是退回普通read');
    const legacyView = await call({ action: 'legacy' }), target = legacyView.candidates.find(item => item.content.includes('晚饭'));
    const operations = [{ op: 'adopt_legacy', ref: '$stale', legacyId: target.legacyId, coreId: 'self', kind: 'preference', importance: 2, reason: '来源重读测试' }];
    const checked = await call({ action: 'preview', expectedRevision: 4, operations });
    assert.equal(checked.preview, true); assert.equal(readCoreMemory(workspace).revision, 4);
    put('memory/profile.json', { likes: ['晚饭只喝凉水'] });
    await assert.rejects(() => call({ action: 'commit', expectedRevision: 4, operations, previewDigest: checked.previewDigest }), /候选.*不存在|来源.*变化/);
    assert.equal(readCoreMemory(workspace).revision, 4);
    await assert.rejects(() => call({ action: 'preview', expectedRevision: 4, operations: [memory('$bad', '伪造新来源') ] }), /来源/);
    const group = await call({ action: 'review' }, 'qq-group-12345678');
    assert.match(JSON.stringify(group), /CUSTOM_GROUP/); assert.doesNotMatch(JSON.stringify(group), /晚饭|测试者夜班|含糖/);
    put('runtime.json', { ...runtime, groupMemoryEnabled: false });
    delete process.env.LOVE_TEST_ISOLATED; // Exercise actual runtime-config updates, still confined to this temporary config.
    await assert.rejects(() => call({ action: 'review' }, 'qq-group-12345678'), /群记忆已关闭/);
    console.log('ok   维护工具：实际preview/review、旧来源重读无半写入、Session来源校验、自定义群目录及群关闭');
  } finally { dispose?.(); }
} finally { assert.equal(path.dirname(workspace), path.resolve(os.tmpdir())); fs.rmSync(workspace, { recursive: true, force: true }); }
await import('./verify-maintenance-evidence.mjs');
