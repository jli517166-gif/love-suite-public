/** Durable turn material, scoped leases and source-checked reflection commits. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { coreMemoryFile, readCoreMemory, commitCoreMemory, coreBatchDigest } from './core-memory.js';
import { segmentPlan, validateSegmentNote, validateSegmentProgress, segmentProgressSummary } from './reflection-segments.js';
import { redactMaterialText, redactMaterials } from './material-privacy.js';
import { reflectionDiagnosis } from './reflection-guidance.js';

const MAX_PENDING = 100, LEASE_MS = 300000, MAX_ATTEMPTS = 3;
const ACTIVE = new Set(['pending', 'leased', 'needs_review', 'failed']);
const USER_SOURCES = new Set(['user', 'user-question-reply', 'plugin:dsh-onebot']);
const ARCHIVE_LIMIT = 256000, MATERIAL_PAGE = 3000;
export function reflectionModelRoute(session) {
  try {
    const config = session?.requestHeader?.()?.config;
    if (['provider', 'model'].every(key => typeof config?.[key] === 'string' && config[key].trim() && config[key].length <= 200)) return { provider: config.provider, model: config.model };
  } catch {}
  return null;
}
export const reflectionFile = (workspace, groupId = '') => path.join(path.dirname(coreMemoryFile(workspace, groupId)), 'reflection-queue.json');
function readQueue(workspace, groupId = '') {
  const file = reflectionFile(workspace, groupId);
  if (!fs.existsSync(file)) return { format: 'love-reflection-queue', schemaVersion: 1, revision: 0, groupId, cursors: [], jobs: [] };
  return privacyView(validateReflectionQueue(JSON.parse(fs.readFileSync(file, 'utf8')), groupId)).state;
}
function privacyView(state) {
  let changedJobs = 0;
  for (const job of state.jobs) {
    const materials = redactMaterials(job.materials);
    const archived = job.materialArchive && redactMaterials(job.materialArchive.materials);
    if (JSON.stringify(materials) === JSON.stringify(job.materials) && (!archived || JSON.stringify(archived) === JSON.stringify(job.materialArchive.materials))) continue;
    changedJobs++;
    job.materials = materials;
    if (archived) {
      job.materialArchive.materials = archived;
      job.materialArchive.digest = coreBatchDigest(archived);
    }
    const hadSegments = !!job.segmentation;
    if (hadSegments) delete job.segmentation;
    if (!job.outcome) {
      if (job.status === 'leased') { job.status = 'needs_review'; job.attempts = Math.max(0, job.attempts - 1); }
      if (hadSegments) job.status = 'needs_review';
      job.lease = null; job.readProgress = null;
      job.lastError = '材料中的凭据已脱敏；旧补读凭据和分段笔记失效，需按脱敏材料重新读取；尚未提交核心';
    }
  }
  return { state, changedJobs };
}
/** Explicit, narrowly scoped repair. Original source sessions and core facts are never rewritten. */
export function sanitizeReflectionQueue(workspace, groupId = '') {
  const file = reflectionFile(workspace, groupId);
  if (!fs.existsSync(file)) return { changedJobs: 0 };
  const original = fs.readFileSync(file, 'utf8');
  const { state, changedJobs } = privacyView(validateReflectionQueue(JSON.parse(original), groupId));
  if (!changedJobs) return { changedJobs: 0 };
  const backup = file + '.privacy-backup-' + randomUUID();
  fs.writeFileSync(backup, original, { flag: 'wx', mode: 0o600 });
  saveQueue(workspace, groupId, state);
  return { changedJobs, backup, revision: state.revision };
}
export function validateReflectionQueue(value, groupId = '') {
  if (value?.format !== 'love-reflection-queue' || value.schemaVersion !== 1 || value.groupId !== groupId || !Number.isSafeInteger(value.revision) || value.revision < 0 || !Array.isArray(value.jobs) || !Array.isArray(value.cursors)) throw new Error('整理队列格式无效，未自动重置');
  const sessions = new Set();
  for (const cursor of value.cursors) {
    if (typeof cursor.sessionId !== 'string' || !cursor.sessionId || sessions.has(cursor.sessionId) || !Number.isSafeInteger(cursor.seq) || cursor.seq < -1) throw new Error('整理游标格式无效');
    sessions.add(cursor.sessionId);
  }
  if (value.cursors.length > 1000 || value.jobs.length > 150 || value.jobs.filter((job) => ACTIVE.has(job.status)).length > MAX_PENDING) throw new Error('整理队列超过保留上限');
  const ids = new Set();
  for (const job of value.jobs) {
    if (job.modelRoute !== undefined && (!reflectionModelRoute({ requestHeader: () => ({ config: job.modelRoute }) }) || Object.keys(job.modelRoute).some(key => !['provider', 'model'].includes(key)))) throw new Error('整理模型路由格式无效');
    if (!/^[a-f0-9]{64}$/.test(job.id) || ids.has(job.id) || !['pending', 'leased', 'done', 'skipped', 'failed', 'needs_review'].includes(job.status) || !Array.isArray(job.materials) || job.materials.length > 64 || !Number.isInteger(job.attempts) || job.attempts < 0 || job.attempts > MAX_ATTEMPTS || typeof job.complete !== 'boolean' || !Number.isSafeInteger(job.endSeq) || !Number.isSafeInteger(job.startSeq) || job.startSeq >= job.endSeq || typeof job.sessionId !== 'string') throw new Error('整理队列条目无效');
    if (job.status === 'leased' && (typeof job.lease?.token !== 'string' || !Number.isFinite(job.lease.expiresAt))) throw new Error('整理领取格式无效');
    if (job.manualRetries !== undefined && (!Number.isInteger(job.manualRetries) || job.manualRetries < 0 || job.manualRetries > 3)) throw new Error('手动重试次数无效');
    if (job.manualActions !== undefined && (!Array.isArray(job.manualActions) || job.manualActions.length > 3 || job.manualActions.some(action => action.action !== 'retry' || typeof action.reason !== 'string' || !action.reason.trim() || action.reason.length > 1000 || !Number.isFinite(Date.parse(action.at))))) throw new Error('手动处理记录无效');
    if (job.materialArchive !== undefined) {
      const archive = job.materialArchive;
      if (typeof archive.complete !== 'boolean' || !Array.isArray(archive.materials) || archive.materials.length > 256 || typeof archive.reason !== 'string' || archive.reason.length > 1000 || archive.digest !== coreBatchDigest(archive.materials) || archive.materials.reduce((n, item) => n + (typeof item.text === 'string' ? item.text.length : ARCHIVE_LIMIT + 1), 0) > ARCHIVE_LIMIT) throw new Error('完整文字快照格式或摘要无效');
      const references = new Set();
      for (const item of archive.materials) {
        if (typeof item.reference !== 'string' || references.has(item.reference) || !['user', 'assistant', 'tool'].includes(item.role) || typeof item.text !== 'string' || !Number.isSafeInteger(item.seq) || (archive.complete && item.truncated)) throw new Error('完整文字来源格式无效');
        references.add(item.reference);
      }
    }
    if (job.segmentation !== undefined) validateSegmentProgress(job.segmentation, job.materialArchive);
    const references = new Set();
    for (const material of job.materials) {
      if (typeof material.reference !== 'string' || references.has(material.reference) || !['user', 'assistant', 'tool'].includes(material.role) || typeof material.text !== 'string' || material.text.length > 4000 || !Number.isSafeInteger(material.seq)) throw new Error('整理材料格式无效');
      references.add(material.reference);
    }
    if (['done', 'skipped'].includes(job.status) && (job.outcome?.status !== job.status || !/^[a-f0-9]{64}$/.test(job.outcome.digest))) throw new Error('整理处理结果无效');
    ids.add(job.id);
  }
  return value;
}
function saveQueue(workspace, groupId, state) {
  state.revision += 1;
  const history = state.jobs.filter((job) => !ACTIVE.has(job.status)).slice(-50);
  const kept = new Set([...state.jobs.filter((job) => ACTIVE.has(job.status)), ...history]);
  state.jobs = state.jobs.filter((job) => kept.has(job));
  validateReflectionQueue(state, groupId);
  const file = reflectionFile(workspace, groupId), temporary = file + '.' + randomUUID() + '.tmp';
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try { fs.writeFileSync(temporary, JSON.stringify(state, null, 2) + '\n', { flag: 'wx' }); fs.renameSync(temporary, file); }
  finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}
function materialsOf(sessionId, events, { maxItems = 64, maxText = 4000, maxTotal = 32000 } = {}) {
  const materials = [], calls = new Map();
  let hasUser = false, complete = true, size = 0;
  for (const event of events) {
    if (event.type === 'tool/call') { calls.set(event.data.callId, event.data.name); continue; }
    let message, toolName;
    if (event.type === 'user/message') {
      message = event.data;
      if (!USER_SOURCES.has(message.source?.kind)) continue;
      if (message.source.kind === 'user-question-reply' && message.source.outcome !== 'answered') continue;
    } else if (event.type === 'assistant/message' && !event.data.interrupted) message = event.data.message;
    else if (event.type === 'tool/result' && !event.data.error && !event.data.message?.isError && calls.has(event.data.message?.toolCallId)) {
      message = event.data.message; toolName = calls.get(message.toolCallId);
      if (String(toolName).startsWith('love_')) continue; // Do not recursively ingest our own memory/status tool output.
    } else continue;
    if (!message || !Array.isArray(message.content)) { complete = false; continue; }
    const text = redactMaterialText(message.content.filter((part) => part.type === 'text').map((part) => part.text || '').join('\n')).text;
    if (message.role === 'user' && message.source?.kind === 'plugin:dsh-onebot' && text.includes('（内心：')) continue;
    const supported = message.role === 'assistant' ? new Set(['text', 'reasoning', 'tool-call', 'redacted-reasoning']) : new Set(['text']);
    if (message.content.some((part) => !supported.has(part.type)) || typeof message.id !== 'string' || !message.id) complete = false;
    if (!text.trim()) continue;
    if (message.role === 'user') hasUser = true;
    if (materials.length >= maxItems || size + text.length > maxTotal) { complete = false; continue; }
    const truncated = text.length > maxText;
    if (truncated) complete = false;
    materials.push({ reference: sessionId + '#' + (message.id || 'event:' + event.seq), messageId: message.id || '', seq: event.seq, role: message.role, sourceKind: message.source?.kind || '', text: text.slice(0, maxText), ...(toolName ? { toolName } : {}), truncated });
    size += text.length;
  }
  return { materials, hasUser, complete };
}
export function liveMemoryMaterials(session) {
  if (typeof session?.snapshotEvents !== 'function' || !session.id) return [];
  const events = session.snapshotEvents(Math.max(0, Number(session.seq || 0) - 256), session.seq).filter(event => typeof session.isOwnSeq !== 'function' || session.isOwnSeq(event.seq));
  return materialsOf(String(session.id), events).materials;
}

export function captureCompletedTurns(workspace, session, endEvent, { groupId = '', collect = true } = {}) {
  if (endEvent?.type !== 'turn/end' || !Number.isSafeInteger(endEvent.seq) || session?.header?.origin === 'subagent' || typeof session?.snapshotEvents !== 'function' || !session.id) return { queued: 0 };
  const state = readQueue(workspace, groupId);
  const cursor = state.cursors.find((item) => item.sessionId === session.id);
  if (!collect) {
    if (endEvent.seq > (cursor?.seq ?? -1)) {
      if (cursor) cursor.seq = endEvent.seq;
      else state.cursors.push({ sessionId: String(session.id), seq: endEvent.seq });
      state.cursors = state.cursors.slice(-1000);
      saveQueue(workspace, groupId, state);
    }
    return { queued: 0 };
  }
  const from = cursor ? cursor.seq + 1 : Math.max(0, Number(session.firstLiveSeq) || 0);
  if (from > endEvent.seq) return { queued: 0 };
  const events = session.snapshotEvents(from, endEvent.seq + 1).filter((event) => typeof session.isOwnSeq !== 'function' || session.isOwnSeq(event.seq));
  let active = null, queued = 0, lastSeq = cursor?.seq ?? -1, overflow = false;
  for (const event of events) {
    if (event.type === 'turn/start') { active = { turn: event.data.turn, startSeq: event.seq, events: [] }; continue; }
    if (!active) continue;
    active.events.push(event);
    if (event.type !== 'turn/end' || event.data.turn !== active.turn) continue;
    if (event.data.reason?.kind === 'completed') {
      const material = materialsOf(String(session.id), active.events);
      const id = createHash('sha256').update(JSON.stringify([session.id, active.turn, event.seq])).digest('hex');
      if (material.hasUser && !state.jobs.some((job) => job.id === id)) {
        if (state.jobs.filter((job) => ACTIVE.has(job.status)).length >= MAX_PENDING) { overflow = true; break; }
        const modelRoute = reflectionModelRoute(session);
        const full = materialsOf(String(session.id), active.events, { maxItems: 256, maxText: ARCHIVE_LIMIT, maxTotal: ARCHIVE_LIMIT });
        const materialArchive = { materials: full.materials, complete: full.complete, reason: full.complete ? '已保存本轮可支持的完整文字' : '存在附件、缺失标识或文字超过256000字符上限，文字快照不完整', digest: coreBatchDigest(full.materials) };
        state.jobs.push({ id, sessionId: String(session.id), turn: active.turn, startSeq: active.startSeq, endSeq: event.seq, materials: material.materials, complete: material.complete, materialArchive, ...(modelRoute ? { modelRoute } : {}), status: material.complete ? 'pending' : 'needs_review', attempts: 0, nextAttemptAt: 0, createdAt: new Date(event.time || Date.now()).toISOString() });
        queued += 1;
      }
    }
    lastSeq = event.seq; active = null;
  }
  if (lastSeq !== (cursor?.seq ?? -1) || queued) {
    if (cursor) cursor.seq = lastSeq;
    else state.cursors.push({ sessionId: String(session.id), seq: lastSeq });
    state.cursors = state.cursors.slice(-1000);
    saveQueue(workspace, groupId, state);
  }
  return { queued, overflow };
}

export function reflectionStatus(workspace, groupId = '', now = Date.now()) {
  const state = readQueue(workspace, groupId), result = { pending: 0, leased: 0, done: 0, skipped: 0, failed: 0, needs_review: 0, ready: 0, revision: state.revision };
  for (const job of state.jobs) result[job.status] += 1;
  // Include the final expired lease so next can settle it as failed instead of leaving it leased forever.
  result.ready = state.jobs.filter((job) => (job.status === 'pending' && job.nextAttemptAt <= now) || (job.status === 'leased' && job.lease.expiresAt <= now)).length;
  return result;
}
export function readReflection(workspace, groupId, id) {
  const job = structuredClone(readQueue(workspace, groupId).jobs.find((job) => job.id === id) || null);
  if (job) job.coreCommitted = !!readCoreMemory(workspace, groupId).processedBatches?.some(item => item.key === 'reflection:' + id);
  return job;
}
export function reflectionDetail(job) {
  if (!job) return null;
  const { materialArchive, readProgress, lease, segmentation, ...detail } = job;
  return { ...detail, diagnosis: reflectionDiagnosis(job), segmentProgress: segmentProgressSummary(segmentation, materialArchive), fullTextAvailable: !!materialArchive, fullTextComplete: !!materialArchive?.complete, fullTextReason: materialArchive?.reason || '旧批次未保存完整文字快照', ...(lease ? { leaseExpiresAt: lease.expiresAt } : {}) };
}
export function listReflections(workspace, groupId = '', offset = 0, { status = 'active' } = {}) {
  if (!['active', 'all', 'pending', 'leased', 'needs_review', 'failed', 'done', 'skipped'].includes(status)) throw new Error('整理筛选状态无效');
  const state = readQueue(workspace, groupId);
  const jobs = state.jobs.filter(job => status === 'all' || (status === 'active' ? ACTIVE.has(job.status) : job.status === status));
  offset = Number.isSafeInteger(offset) && offset >= 0 ? offset : 0;
  const receipts = new Set((readCoreMemory(workspace, groupId).processedBatches || []).map(item => item.key));
  return { revision: state.revision, total: jobs.length, jobs: jobs.slice(offset, offset + 20).map(job => { const { id, sessionId, turn, status, attempts, createdAt, lastError, outcome, nextAttemptAt, manualRetries, complete, materialArchive } = job; return { id, sessionId, turn, status, attempts, createdAt, lastError, outcome, nextAttemptAt, manualRetries: manualRetries || 0, complete, diagnosis: reflectionDiagnosis({ ...job, coreCommitted: receipts.has('reflection:' + id) }), fullTextAvailable: !!materialArchive, fullTextComplete: !!materialArchive?.complete }; }), nextOffset: offset + 20 < jobs.length ? offset + 20 : null };
}
export function claimReflection(workspace, groupId = '', now = Date.now(), { eligible = () => true, includeCompleteArchives = false } = {}) {
  const state = readQueue(workspace, groupId);
  const receipts = new Map((readCoreMemory(workspace, groupId).processedBatches || []).map((item) => [item.key, item]));
  let changed = false;
  for (const job of state.jobs) {
    const receipt = receipts.get('reflection:' + job.id);
    if (ACTIVE.has(job.status) && receipt) { settleReceipt(job, receipt, now); changed = true; continue; }
    if (job.status === 'leased' && job.lease.expiresAt <= now) { job.status = job.attempts >= MAX_ATTEMPTS ? 'failed' : job.reviewLease ? 'needs_review' : 'pending'; job.readProgress = null; job.lastError = '上次领取超时'; changed = true; }
    const archiveReady = includeCompleteArchives && job.status === 'needs_review' && !job.outcome && job.materialArchive?.complete === true && job.attempts < MAX_ATTEMPTS;
    if ((job.status !== 'pending' && !archiveReady) || job.nextAttemptAt > now || !eligible(job)) continue;
    if (archiveReady) { job.reviewLease = true; job.readProgress = null; }
    job.status = 'leased'; job.attempts += 1; job.lease = { token: randomUUID(), expiresAt: now + LEASE_MS };
    saveQueue(workspace, groupId, state);
    return { job: reflectionDetail(structuredClone(job)), leaseToken: job.lease.token };
  }
  if (changed) saveQueue(workspace, groupId, state);
  return { job: null };
}
function claimed(state, input, now) {
  const job = state.jobs.find((item) => item.id === input.jobId);
  if (!job || job.status !== 'leased' || job.lease?.token !== input.leaseToken || job.lease.expiresAt <= now) throw new Error('整理领取已失效，请重新领取');
  return job;
}
/** Persist exactly one provisional segment; never mutate the core memory store. */
export function saveReflectionSegment(workspace, input, { groupId = '', now = Date.now() } = {}) {
  const state = readQueue(workspace, groupId), job = claimed(state, input, now);
  const plan = segmentPlan(job.materialArchive);
  if (!plan) throw new Error('该批次不能有界分段');
  const progress = job.segmentation || { format: 'love-segment-progress', schemaVersion: 1, digest: plan.digest, notes: [], blocked: false };
  validateSegmentProgress(progress, job.materialArchive);
  if (progress.blocked || input.index !== progress.notes.length || input.index > plan.segments.length || (!input.blockedReason && input.index === plan.segments.length)) throw new Error('分段检查点顺序无效');
  if (input.blockedReason) { reasonOf(input.blockedReason); progress.blocked = true; }
  else progress.notes.push(validateSegmentNote(input.note, plan.segments[input.index]));
  job.segmentation = progress;
  job.status = 'needs_review'; job.reviewLease = true; job.lease = null; job.readProgress = null;
  job.attempts = Math.max(0, job.attempts - 1);
  job.nextAttemptAt = input.nextAttemptAt || now;
  job.lastError = progress.blocked ? reasonOf(input.blockedReason) : `已读${progress.notes.length}/${plan.segments.length}段，等待后续阅读或最终合成`;
  saveQueue(workspace, groupId, state);
  return { status: job.status, segmentProgress: segmentProgressSummary(progress, job.materialArchive) };
}
function reasonOf(value) { if (typeof value !== 'string' || !value.trim() || value.length > 1000) throw new Error('需要 1–1000 字符的处理理由'); return value.trim(); }
function checkRevision(state, input) {
  if (input.expectedRevision !== undefined && input.expectedRevision !== state.revision) throw new Error('整理队列版本已变化，请刷新后重试');
}
function requiredJob(state, id) {
  const job = state.jobs.find(item => item.id === id);
  if (!job) throw new Error('整理批次不存在于当前范围');
  return job;
}
export function retryReflection(workspace, input, { groupId = '', now = Date.now() } = {}) {
  const state = readQueue(workspace, groupId); checkRevision(state, input);
  const job = requiredJob(state, input.jobId), reason = reasonOf(input.reason);
  const receipt = receiptOf(workspace, groupId, job);
  if (receipt) { settleReceipt(job, receipt, now); saveQueue(workspace, groupId, state); return job.outcome; }
  if (job.outcome || !['failed', 'pending'].includes(job.status)) throw new Error('当前状态不能重试；进行中批次不可抢占，待补读请先读取全文');
  if (!job.complete && !job.materialArchive?.complete) throw new Error('材料不完整，不能重试为完整批次');
  if ((job.manualRetries || 0) >= 3) throw new Error('本批手动重试已达3次上限，请查看原因或跳过');
  job.manualRetries = (job.manualRetries || 0) + 1;
  job.lastManualAction = { action: 'retry', reason, at: new Date(now).toISOString() };
  job.manualActions = [...(job.manualActions || []), job.lastManualAction];
  job.status = job.complete ? 'pending' : 'needs_review'; job.attempts = 0; job.nextAttemptAt = now; job.lease = null; job.readProgress = null;
  saveQueue(workspace, groupId, state);
  return { status: job.status, revision: state.revision };
}
export function claimReflectionReview(workspace, input, { groupId = '', now = Date.now() } = {}) {
  const state = readQueue(workspace, groupId), job = requiredJob(state, input.jobId);
  if (job.status !== 'needs_review' || job.outcome || job.attempts >= MAX_ATTEMPTS) throw new Error('只有待补读批次可以领取全文整理，请刷新状态');
  if (!job.materialArchive?.complete) throw new Error(job.materialArchive?.reason || '旧批次缺失完整快照，不能冒充完整材料');
  job.status = 'leased'; job.attempts++; job.reviewLease = true; job.readProgress = null;
  job.lease = { token: randomUUID(), expiresAt: now + LEASE_MS };
  saveQueue(workspace, groupId, state);
  const safe = reflectionDetail(structuredClone(job));
  return { job: safe, leaseToken: job.lease.token, instruction: '用 material 携带 jobId/leaseToken，从offset=0顺序读取所有页，最后将readToken带给complete。附件和缺失材料不可自动补全。' };
}
export function readReflectionMaterial(workspace, input, { groupId = '', now = Date.now(), track = false, plain = false } = {}) {
  const state = readQueue(workspace, groupId), job = requiredJob(state, input.jobId);
  const archive = job.materialArchive;
  if (!archive) throw new Error('旧批次没有完整文字快照，需重新提供原材料，不能从节选恢复全文');
  const serialized = plain && !track ? archive.materials.map(item => `[${item.role}] ${item.reference}\n${item.text}`).join('\n\n') : JSON.stringify({ materials: archive.materials });
  const offset = input.offset ?? 0;
  if (!Number.isSafeInteger(offset) || offset < 0 || offset >= serialized.length) throw new Error('材料分页起点无效');
  const nextOffset = offset + MATERIAL_PAGE < serialized.length ? offset + MATERIAL_PAGE : null;
  const result = { format: plain && !track ? 'plain-text' : 'serialized-materials-json', text: serialized.slice(offset, offset + MATERIAL_PAGE), offset, previousOffset: offset > 0 ? Math.max(0, offset - MATERIAL_PAGE) : null, nextOffset, totalChars: serialized.length, materialDigest: archive.digest, complete: archive.complete, reason: archive.reason };
  if (track) {
    claimed(state, input, now);
    if (offset === 0) job.readProgress = { token: randomUUID(), nextOffset: 0, digest: archive.digest, leaseToken: job.lease.token };
    if (!job.readProgress || job.readProgress.nextOffset !== offset || job.readProgress.digest !== archive.digest || job.readProgress.leaseToken !== job.lease.token) throw new Error('需要从起点顺序补读，不能跳过材料页');
    job.readProgress.nextOffset = nextOffset;
    if (nextOffset === null && archive.complete) result.readToken = job.readProgress.token;
    saveQueue(workspace, groupId, state);
  }
  return result;
}
function receiptOf(workspace, groupId, job) { return readCoreMemory(workspace, groupId).processedBatches?.find((item) => item.key === 'reflection:' + job.id); }
function settleReceipt(job, receipt, now) {
  job.status = 'done'; job.lease = null; job.readProgress = null;
  job.outcome = { status: 'done', reason: '核心变化已保存，恢复队列确认', digest: receipt.digest, result: receipt.result, at: new Date(now).toISOString() };
}
export function validateMemoryOperationSources(job, operations) {
  if (!job.complete && operations.length) throw new Error('材料不完整，需要补读原会话或跳过');
  const sources = new Map(job.materials.map((item) => [item.reference, item]));
  for (const operation of operations) {
    if (!operation || !['create_core', 'record_memory', 'attach_source', 'supersede_memory', 'update_core', 'update_memory', 'link', 'archive'].includes(operation.op)) throw new Error('整理操作种类无效');
    if (!['record_memory', 'attach_source', 'supersede_memory'].includes(operation.op) && !(operation.op === 'update_memory' && ['content', 'source', 'epistemic'].some((key) => operation[key] !== undefined))) continue;
    const source = sources.get(operation.source?.reference);
    if (!source || !operation.epistemic) throw Object.assign(new Error('记忆需要引用真实消息来源并标明认知类型；请使用 read 返回的 sourceHints.reference 或本批 materials.reference'), { code: 'REFLECTION_SOURCE_REFERENCE' });
    const kind = operation.source.kind;
    if (kind === 'reflection' && operation.epistemic === 'inferred') continue;
    if (kind === 'conversation' && source.role === 'user' && ['reported', 'inferred'].includes(operation.epistemic)) continue;
    if (kind === 'tool_result' && source.role === 'tool') continue;
    throw Object.assign(new Error('来源角色不匹配；模型理解必须标记为推测，不能变成用户陈述或真实工具经历'), { code: 'REFLECTION_SOURCE_ROLE' });
  }
}
export function completeReflection(workspace, input, { groupId = '', now = Date.now(), commit = commitCoreMemory } = {}) {
  if (!Array.isArray(input.operations) || input.operations.length > 20) throw new Error('一次整理需要 0–20 项操作');
  const reason = reasonOf(input.reason), state = readQueue(workspace, groupId), digest = coreBatchDigest(input.operations);
  const existing = state.jobs.find((job) => job.id === input.jobId);
  if (existing?.outcome) {
    if (existing.outcome.digest !== digest) throw new Error('该整理批次已处理其他内容');
    return existing.outcome;
  }
  const job = claimed(state, input, now);
  const receipt = receiptOf(workspace, groupId, job);
  if (receipt && receipt.digest !== digest) throw new Error('本批核心变化已经保存，请通过 next 恢复确认，不能改作空结果');
  let material = job;
  if (input.segmentDigest !== undefined) {
    const summary = segmentProgressSummary(job.segmentation, job.materialArchive);
    if (summary?.phase !== 'synthesis' || input.segmentDigest !== job.materialArchive?.digest) throw new Error('分段未完整确认或材料已改变');
  }
  if ((!job.complete && input.operations.length) || input.segmentDigest !== undefined) {
    const progress = job.readProgress;
    if (!job.materialArchive?.complete || !input.readToken || input.readToken !== progress?.token || progress.nextOffset !== null || progress.digest !== job.materialArchive.digest || progress.leaseToken !== job.lease.token) throw new Error('材料不完整，需要顺序补读全文并提交最后一页readToken');
    material = { ...job, complete: true, materials: job.materialArchive.materials };
  }
  validateMemoryOperationSources(material, input.operations);
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) throw new Error('需要当前核心记忆版本');
  if (!input.operations.length && readCoreMemory(workspace, groupId).revision !== input.expectedRevision)
    throw new Error('核心记忆版本已变化，请基于当前核心重新合成，不能用旧快照跳过');
  const result = input.operations.length ? commit(workspace, { expectedRevision: input.expectedRevision, operations: input.operations }, { groupId, sessionId: job.sessionId, batchKey: 'reflection:' + job.id }) : null;
  job.status = input.operations.length ? 'done' : 'skipped';
  job.outcome = { status: job.status, reason, result, digest, at: new Date(now).toISOString() };
  job.lease = null; job.readProgress = null; saveQueue(workspace, groupId, state);
  return job.outcome;
}
export function failReflection(workspace, input, { groupId = '', now = Date.now() } = {}) {
  const state = readQueue(workspace, groupId), job = claimed(state, input, now);
  const receipt = receiptOf(workspace, groupId, job);
  if (receipt) { settleReceipt(job, receipt, now); saveQueue(workspace, groupId, state); return job.outcome; }
  job.lastError = reasonOf(input.reason); job.status = job.attempts >= MAX_ATTEMPTS ? 'failed' : job.reviewLease ? 'needs_review' : 'pending'; job.nextAttemptAt = now + Math.min(3600000, 60000 * 2 ** (job.attempts - 1)); job.lease = null; job.readProgress = null;
  saveQueue(workspace, groupId, state);
  return { status: job.status, nextAttemptAt: job.nextAttemptAt };
}
export function skipReflection(workspace, input, { groupId = '', now = Date.now() } = {}) {
  const state = readQueue(workspace, groupId), job = state.jobs.find((item) => item.id === input.jobId);
  checkRevision(state, input);
  if (!job || job.outcome) throw new Error('该整理批次不存在或已处理');
  if (job.status === 'leased' && job.lease.expiresAt > now) claimed(state, input, now);
  const receipt = receiptOf(workspace, groupId, job);
  if (receipt) { settleReceipt(job, receipt, now); saveQueue(workspace, groupId, state); return job.outcome; }
  job.status = 'skipped'; job.lease = null; job.readProgress = null;
  job.outcome = { status: 'skipped', reason: reasonOf(input.reason), result: null, digest: coreBatchDigest([]), at: new Date(now).toISOString() };
  saveQueue(workspace, groupId, state);
  return job.outcome;
}

/** Return a cancelled lease, or defer oversized material without spending a model retry. */
export function releaseReflection(workspace, input, { groupId = '', now = Date.now(), needsReview = false } = {}) {
  const state = readQueue(workspace, groupId), job = claimed(state, input, now);
  const receipt = receiptOf(workspace, groupId, job);
  if (receipt) settleReceipt(job, receipt, now);
  else {
    job.status = needsReview || job.reviewLease ? 'needs_review' : 'pending';
    job.attempts = Math.max(0, job.attempts - 1); job.lease = null;
    job.lastError = reasonOf(input.reason); job.nextAttemptAt = input.nextAttemptAt || now;
  }
  saveQueue(workspace, groupId, state);
  return { status: job.status };
}
