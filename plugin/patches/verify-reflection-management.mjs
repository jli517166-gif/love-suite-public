import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
process.env.LOVE_TEST_ISOLATED = '1';
const queue = await import('../reflection.js');
const { readCoreMemory } = await import('../core-memory.js');
const { exportMemory, importMemory } = await import('../backup.js');
const { apply, handleApi } = await import('../index.js');
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'love-management-'));
const now = Date.now();
const longText = '测试材料开头。' + '这是需要完整保留的文字。'.repeat(500) + '末尾更正：现在最喜欢茉莉花茶。';
function capture(ws, text, id, groupId = '', attachment = false) {
  const events = [
    { type: 'turn/start', seq: 0, time: now, data: { turn: 1 } },
    { type: 'user/message', seq: 1, time: now, data: { id: 'u1', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text }, ...(attachment ? [{ type: 'image', url: 'test-image' }] : [])] } },
    { type: 'assistant/message', seq: 2, time: now, data: { message: { id: 'a1', role: 'assistant', content: [{ type: 'reasoning', text: '不能进入归档的推理' }, { type: 'text', text: '收到' }] } } },
    { type: 'turn/end', seq: 3, time: now, data: { turn: 1, reason: { kind: 'completed' } } },
  ];
  queue.captureCompletedTurns(ws, { id, firstLiveSeq: 0, snapshotEvents: (from, to) => events.filter(e => e.seq >= from && e.seq < to) }, events.at(-1), { groupId });
  return queue.listReflections(ws, groupId).jobs.find(job => job.sessionId === id).id;
}
try {
  const id = capture(workspace, longText, 'long-session');
  const job = queue.readReflection(workspace, '', id);
  assert.equal(job.status, 'needs_review');
  assert.ok(job.materialArchive?.complete, '长文字节选之外必须保留可补读的完整文字快照');
  assert.equal(queue.claimReflection(workspace).job, null);
  const lease = queue.claimReflectionReview(workspace, { jobId: id });
  assert.ok(lease.leaseToken);
  const input = { jobId: id, leaseToken: lease.leaseToken, expectedRevision: 0, reason: '已读完全文末尾的明确修正', operations: [{ op: 'record_memory', ref: '$m', coreId: 'self', content: '测试者当前最喜欢茉莉花茶', kind: 'preference', epistemic: 'reported', importance: 3, reason: '全文最后明确陈述', source: { kind: 'conversation', reference: 'long-session#u1' } }] };
  assert.throws(() => queue.completeReflection(workspace, input), /补读|完整/);
  assert.throws(() => queue.readReflectionMaterial(workspace, { jobId: id, leaseToken: lease.leaseToken, offset: 3000 }, { track: true }), /顺序|起点/);
  let offset = 0, text = '', receipt;
  do {
    const page = queue.readReflectionMaterial(workspace, { jobId: id, leaseToken: lease.leaseToken, offset }, { track: true });
    assert.ok(page.text.length <= 3000); text += page.text;
    offset = page.nextOffset; receipt = page.readToken;
  } while (offset !== null);
  const full = JSON.parse(text);
  assert.equal(full.materials[0].text, longText);
  assert.ok(!text.includes('不能进入归档的推理'));
  assert.ok(receipt);
  queue.completeReflection(workspace, { ...input, readToken: receipt });
  assert.equal(readCoreMemory(workspace).memories[0].content, '测试者当前最喜欢茉莉花茶');
  console.log('ok   批次补读：长文末尾可逐页完整读取，未读全不得提交，来源和推理排除保持');

  const attached = capture(workspace, '含附件的文字部分', 'attachment-session', '', true);
  assert.throws(() => queue.claimReflectionReview(workspace, { jobId: attached }), /附件|不完整|缺失/);
  const huge = capture(workspace, '字'.repeat(260000), 'huge-session');
  assert.equal(queue.readReflection(workspace, '', huge).materialArchive.complete, false);
  assert.throws(() => queue.claimReflectionReview(workspace, { jobId: huge }), /不完整|上限|缺失/);
  assert.throws(() => queue.readReflectionMaterial(workspace, { jobId: '../bad' }), /不存在/);
  const old = capture(workspace, '旧格式批次', 'old-session');
  const file = queue.reflectionFile(workspace), state = JSON.parse(fs.readFileSync(file, 'utf8'));
  delete state.jobs.find(j => j.id === old).materialArchive;
  fs.writeFileSync(file, JSON.stringify(state));
  assert.throws(() => queue.readReflectionMaterial(workspace, { jobId: old }), /旧批次|快照|缺失/);
  queue.skipReflection(workspace, { jobId: old, reason: '旧快照缺失，不冒充可处理材料' });
  console.log('ok   批次补读：附件/超限/旧批次缺失明确拒绝，不能冒充全文');

  const retryId = capture(workspace, '可重试的完整材料', 'retry-session');
  for (let i = 0; i < 3; i++) {
    const lease = queue.claimReflection(workspace, '', now + i * 400000);
    assert.equal(lease.job.id, retryId);
    queue.failReflection(workspace, { jobId: retryId, leaseToken: lease.leaseToken, reason: '模型临时失败' }, { now: now + i * 400000 + 1 });
  }
  assert.equal(queue.readReflection(workspace, '', retryId).status, 'failed');
  let revision = queue.reflectionStatus(workspace).revision;
  assert.throws(() => queue.retryReflection(workspace, { jobId: retryId, expectedRevision: revision - 1, reason: '用户选择重试' }), /版本/);
  queue.retryReflection(workspace, { jobId: retryId, expectedRevision: revision, reason: '用户选择重试' });
  assert.equal(queue.readReflection(workspace, '', retryId).status, 'pending');
  const running = queue.claimReflection(workspace);
  assert.throws(() => queue.retryReflection(workspace, { jobId: retryId, reason: '不能抢占' }), /领取|进行中|状态/);
  assert.throws(() => queue.skipReflection(workspace, { jobId: retryId, reason: '不能抢占' }), /领取/);
  queue.failReflection(workspace, { jobId: retryId, leaseToken: running.leaseToken, reason: '归还一次失败' });
  revision = queue.reflectionStatus(workspace).revision;
  queue.skipReflection(workspace, { jobId: retryId, expectedRevision: revision, reason: '用户决定跳过这轮' });
  const history = queue.listReflections(workspace, '', 0, { status: 'all' });
  assert.ok(history.jobs.some(j => j.id === retryId && j.outcome.reason === '用户决定跳过这轮'));
  assert.throws(() => queue.retryReflection(workspace, { jobId: retryId, reason: '不能复活已完成项' }), /处理|状态/);
  const capped = capture(workspace, '只能手动重试三次', 'capped-session');
  for (let count = 0; count < 3; count++) queue.retryReflection(workspace, { jobId: capped, reason: `明确的第${count + 1}次重试` });
  assert.throws(() => queue.retryReflection(workspace, { jobId: capped, reason: '第四次不能继续' }), /上限/);
  assert.deepEqual(queue.readReflection(workspace, '', capped).manualActions.map(action => action.reason), ['明确的第1次重试', '明确的第2次重试', '明确的第3次重试']);
  queue.skipReflection(workspace, { jobId: capped, reason: '达到手动上限后停止' });
  console.log('ok   批次管理：失败重试受版本和租约保护，跳过保留理由，完成项不会重新处理');

  capture(workspace, '群内专属材料', 'qq-group-12345678', '12345678');
  const config = { workspace, channel: 'none', proactiveEnabled: false, reflectionBackgroundEnabled: false, groupMemoryEnabled: true };
  const tools = new Map();
  const dispose = await apply({ tools: { register(tool) { tools.set(tool.name, tool); } }, on() {}, logger: { info() {}, warn() {} } }, config);
  const server = http.createServer((req, res) => handleApi(req, res, config));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}/love-companion/api/reflection`;
    const group = await (await fetch(base + '?groupId=12345678&status=all')).json();
    assert.equal(group.total, 1); assert.ok(!JSON.stringify(group).includes('long-session'));
    const cross = await (await fetch(base + '?groupId=12345678&jobId=' + id)).json(); assert.equal(cross.job, null);
    const detail = await (await fetch(base + '?jobId=' + id)).json(); assert.equal(detail.job.lease, undefined); assert.equal(detail.job.readProgress, undefined); assert.equal(detail.job.materialArchive, undefined);
    const denied = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://bad.example' }, body: JSON.stringify({ action: 'skip', jobId: attached, expectedRevision: queue.reflectionStatus(workspace).revision, reason: '不应执行' }) }); assert.equal(denied.status, 403);
    const groupExecution = { agent: { session: { id: 'qq-group-12345678', header: { cwd: workspace } } } };
    await assert.rejects(() => tools.get('love_reflection').execute({ action: 'material', jobId: id }, groupExecution), /不存在/);
    const response = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'skip', jobId: attached, expectedRevision: queue.reflectionStatus(workspace).revision, reason: '附件暂不处理' }) }); assert.equal(response.ok, true);
    assert.equal(queue.readReflection(workspace, '', attached).outcome.reason, '附件暂不处理');
    const restored = path.join(workspace, 'restored'); importMemory(restored, exportMemory(workspace));
    assert.equal(queue.readReflection(restored, '', id).materialArchive.materials[0].text, longText);
    const bundle = exportMemory(workspace), corrupt = JSON.parse(bundle.files['reflection-queue.json']);
    corrupt.jobs.find(job => job.id === id).materialArchive.materials[0].text = '篡改后不得冒充旧快照';
    const saved = fs.readFileSync(queue.reflectionFile(restored), 'utf8');
    assert.throws(() => importMemory(restored, { ...bundle, files: { ...bundle.files, 'reflection-queue.json': JSON.stringify(corrupt) } }), /快照|摘要/);
    assert.equal(fs.readFileSync(queue.reflectionFile(restored), 'utf8'), saved);
  } finally { await new Promise(resolve => server.close(resolve)); dispose?.(); }
  console.log('ok   管理API与工具：按范围隔离、拒绝跨站写、隐藏领取凭据、备份保留全文');
} finally { assert.equal(path.dirname(workspace), path.resolve(os.tmpdir())); fs.rmSync(workspace, { recursive: true, force: true }); }
