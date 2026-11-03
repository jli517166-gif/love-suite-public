import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { commitCoreMemory, readCoreMemory, coreMemoryFile } from '../core-memory.js';
const mod = await import('../maintenance-proposals.js').catch(() => ({}));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'love-maintenance-proposals-'));
const jobId = 'a'.repeat(64);
const memory = (ref, coreId, content) => ({ op: 'record_memory', ref, coreId, content, kind: 'preference', epistemic: 'reported', importance: 4, reason: '隔离测试', source: { kind: 'conversation', reference: 'fixture' } });
try {
  assert.equal(typeof mod.maintenanceContext, 'function', '需要完整有界后台维护上下文');
  const seeded = commitCoreMemory(root, { expectedRevision: 0, operations: [
    { op: 'create_core', ref: '$a', title: '夜班饮品', summary: '夜班的饮品', reason: '隔离测试', evidenceIds: ['$m'] },
    { op: 'create_core', ref: '$b', title: '饮品边界', summary: '夜班的饮品边界', reason: '隔离测试', evidenceIds: ['$n'] },
    memory('$m', '$a', '夜班喝麦茶'), memory('$n', '$b', '夜班不喝含糖饮料'),
  ] });
  const context = mod.maintenanceContext(readCoreMemory(root), '夜班饮品');
  assert.equal(context.cores.length, 2); assert.equal(context.memories.length, 2);
  assert.ok(context.cores.every(core => core.childrenComplete && core.evidenceComplete));
  assert.ok(Buffer.byteLength(JSON.stringify(context)) <= 8000);
  const proposal = { reason: '同一饮品主题整理', operations: [
    { op: 'update_memory', id: seeded.references.$n, coreId: seeded.references.$a, reason: '合并归属' },
    { op: 'archive', id: seeded.references.$b, reason: '子记忆移动后保留历史' },
  ] };
  const before = fs.readFileSync(coreMemoryFile(root), 'utf8');
  const saved = mod.saveMaintenanceProposal(root, '', { jobId, context, proposal });
  assert.equal(saved.status, 'suggested');
  assert.equal(fs.readFileSync(coreMemoryFile(root), 'utf8'), before, '建议不得应用核心变化');
  assert.equal(mod.saveMaintenanceProposal(root, '', { jobId, context, proposal }).id, saved.id);
  const read = mod.readMaintenanceProposals(root, '', { id: saved.id });
  assert.equal(read.items.length, 1); assert.equal(read.items[0].stale, false);
  assert.equal(read.items[0].preview.preview, true);
  assert.deepEqual(read.items[0].operations, proposal.operations);
  assert.equal(mod.readMaintenanceProposals(root, '12345678').items.length, 0);
  assert.throws(() => mod.saveMaintenanceProposal(root, '', { jobId: 'b'.repeat(64), context, proposal: { reason: '覆盖', operations: [{ op: 'update_memory', id: seeded.references.$m, content: '偷改正文', reason: '覆盖' }] } }), /归属|允许|字段/);
  assert.throws(() => mod.saveMaintenanceProposal(root, '', { jobId: 'b'.repeat(64), context, proposal: { reason: '归档自我', operations: [{ op: 'archive', id: 'self', reason: '覆盖' }] } }), /完整|目标|自我/);
  const incomplete = structuredClone(context); incomplete.memories.pop();
  assert.throws(() => mod.saveMaintenanceProposal(root, '', { jobId: 'b'.repeat(64), context: incomplete, proposal }), /完整|变化/);
  commitCoreMemory(root, { expectedRevision: 1, operations: [memory('$extra', 'self', '新事实')] });
  assert.equal(mod.readMaintenanceProposals(root).items[0].stale, true);
  // Unrelated commits can advance revision; targets must still be identical and preview is regenerated.
  const fresh = mod.saveMaintenanceProposal(root, '', { jobId: 'c'.repeat(64), context, proposal });
  assert.equal(fresh.status, 'suggested');
  commitCoreMemory(root, { expectedRevision: 2, operations: [{ op: 'update_memory', id: seeded.references.$m, coreId: 'self', reason: '并发变化' }] });
  assert.throws(() => mod.saveMaintenanceProposal(root, '', { jobId: 'd'.repeat(64), context, proposal }), /变化/);
  const many = structuredClone(readCoreMemory(root)); many.memories.push(...Array.from({ length: 13 }, (_, i) => ({ ...many.memories[1], id: 'extra-' + i })));
  const small = mod.maintenanceContext(many, '夜班饮品');
  assert.ok(!small.cores.some(core => core.id === seeded.references.$b), '子记忆超限时整个分支省略');
  const huge = structuredClone(readCoreMemory(root)); huge.memories[1].content = '长'.repeat(4000);
  assert.ok(!mod.maintenanceContext(huge, '夜班饮品').cores.some(core => core.id === seeded.references.$b));
  for (let i = 0; i < 22; i++) mod.saveMaintenanceProposal(root, '', { jobId: i.toString(16).padStart(64, '0'), context: mod.maintenanceContext(readCoreMemory(root), '夜班饮品'), proposal: { reason: '仅空核心摘要', operations: [{ op: 'update_core', id: seeded.references.$a, summary: '饮品主题', reason: '隔离测试' }] } });
  assert.equal(mod.readMaintenanceProposals(root).total, 20);
  const ws = path.join(root, 'worker'); fs.mkdirSync(path.join(ws, 'memory'), { recursive: true });
  fs.copyFileSync(coreMemoryFile(root), coreMemoryFile(ws));
  const queue = await import('../reflection.js'), worker = await import('../reflection-worker.js');
  let largeInput, retainedText;
  for (let length = 18000; length >= 14000; length -= 100) {
    retainedText = '夜班饮品' + 'x'.repeat(length);
    try { largeInput = worker.reflectionInput({ workspace: ws, groupId: '' }, { materials: [{ role: 'user', text: retainedText, reference: 'fixture' }], attempts: 0 }); break; }
    catch (error) { if (error.code !== 'REFLECTION_INPUT_LIMIT') throw error; }
  }
  assert.ok(largeInput, '有界真实材料仍有可用输入空间');
  assert.equal(largeInput.maintenance, null, '总输入临近24KB时优先省略可选维护，不丢弃真实材料');
  assert.ok(largeInput.text.includes(retainedText), '输入临界点仍保留全部材料而非静默截断');
  let time = Date.UTC(2026, 10, 2), calls = 0, bad = false;
  const seed = id => {
    const events = [{ type: 'turn/start', seq: 0, time, data: { turn: 1 } }, { type: 'user/message', seq: 1, time, data: { id: 'u', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '夜班饮品' }] } }, { type: 'turn/end', seq: 2, time, data: { turn: 1, reason: { kind: 'completed' } } }];
    queue.captureCompletedTurns(ws, { id, firstLiveSeq: 0, header: { cwd: ws }, requestHeader: () => ({ config: { provider: 'fixture', model: 'fixture' } }), snapshotEvents: () => events }, events[2]);
  };
  const service = { async prepareCall(config) { return { config, stream: async function* (options) {
    calls++; const input = JSON.parse(options.messages[0].content[0].text);
    assert.ok(input.maintenance.cores.length > 0, '同一次调用提供完整维护上下文');
    yield { type: 'text-delta', text: JSON.stringify({ operations: [memory('$new', 'self', '明确的新偏好' + calls)].map(op => ({ ...op, source: { kind: 'conversation', reference: input.materials[0].reference } })), reason: '保留实际表达', maintenance: { reason: '合并建议', operations: bad ? [{ op: 'archive', id: 'self', reason: '无效建议' }] : [{ op: 'update_core', id: seeded.references.$a, summary: '待审查的归属', reason: '建议待审查' }] } }) };
    yield { type: 'finish', reason: { kind: 'stop' } };
  } }; } };
  const runner = worker.createReflectionWorker({ llm: () => service, scopes: () => [{ primary: ws, workspace: ws, groupId: '' }], config: () => ({}), now: () => time });
  seed('first'); await runner.tick(); await runner.tick();
  assert.equal(calls, 1, '维护不能增加额外模型请求');
  assert.equal(runner.describe(ws).lastResult.maintenance.status, 'suggested');
  assert.equal(readCoreMemory(ws).cores.find(core => core.id === seeded.references.$a).summary, '夜班的饮品');
  assert.equal(mod.readMaintenanceProposals(ws).total, 1);
  time += 600001; bad = true; seed('second'); await runner.tick();
  assert.equal(runner.describe(ws).lastResult.status, 'done');
  assert.equal(runner.describe(ws).lastResult.maintenance.status, 'rejected');
  assert.equal(readCoreMemory(ws).memories.length, 5, '坏建议不撤销正常提炼');
  await runner.stop();
  process.env.LOVE_TEST_ISOLATED = '1'; process.env.LOVE_COMPANION_CONFIG = path.join(ws, 'runtime.json');
  const config = { workspace: ws, channel: 'none', proactiveEnabled: false, reflectionBackgroundEnabled: false };
  fs.writeFileSync(process.env.LOVE_COMPANION_CONFIG, JSON.stringify(config));
  const { apply } = await import('../index.js'), tools = new Map();
  const dispose = await apply({ tools: { register(tool) { tools.set(tool.name, tool); } }, on() {}, logger: { info() {}, warn() {} } }, config);
  const tool = tools.get('love_core_memory'), execution = id => ({ agent: { session: { id, header: { cwd: ws } } } });
  assert.ok(tool.parameters.properties.action.enum.includes('proposals'));
  assert.equal(JSON.parse((await tool.execute({ action: 'proposals' }, execution('private'))).text).total, 1);
  assert.equal(JSON.parse((await tool.execute({ action: 'proposals' }, execution('qq-group-12345678'))).text).total, 0);
  fs.writeFileSync(process.env.LOVE_COMPANION_CONFIG, JSON.stringify({ ...config, groupMemoryEnabled: false }));
  delete process.env.LOVE_TEST_ISOLATED;
  await assert.rejects(tool.execute({ action: 'proposals' }, execution('qq-group-12345678')), /群记忆已关闭/);
  await dispose?.();
  console.log('ok   后台同调用建议、无额外请求、坏建议隔离、正式工具读取/群隔离/关闭');
  fs.writeFileSync(mod.maintenanceProposalFile(root), '{}');
  assert.throws(() => mod.readMaintenanceProposals(root), /无效/);
  console.log('ok   后台维护建议：完整小范围/预算/归属白名单/无核心写入/陈旧标记/并发拒绝/范围/幂等/上限/损坏不重置');
} finally { if (path.dirname(root) !== os.tmpdir()) throw new Error('unsafe fixture path'); fs.rmSync(root, { recursive: true, force: true }); }
