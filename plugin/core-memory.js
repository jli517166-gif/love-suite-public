import { operationFields } from "./memory-contract.js";
/** Explicit, model-authored core memories. The host validates and commits one batch. */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { legacyReference } from './legacy-memory.js';

export function coreMemoryFile(workspace, groupId = '') {
  if (groupId && !/^[1-9][0-9]{4,11}$/.test(String(groupId))) throw new Error('群号不合法');
  return path.join(workspace, 'memory', ...(groupId ? ['groups', String(groupId)] : []), 'core-memory.json');
}

function initialStore() {
  return { format: 'love-core-memory', schemaVersion: 1, revision: 0, rootId: 'self',
    cores: [{ id: 'self', kind: 'self', title: '自我', summary: '', reason: '', evidenceIds: [], parentId: null, status: 'active', version: 1 }],
    memories: [], links: [], changes: [] };
}

function text(value, field, max = 4000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`${field} 必须是 1–${max} 字符的文本`);
  return value.trim();
}

const contentHash = content => createHash('sha256').update(String(content).replace(/\r\n/g, '\n').trim()).digest('hex');
function validateSource(source, epistemic) {
  if (!source || !['conversation', 'tool_result', 'reflection', 'import'].includes(source.kind)) throw new Error('记忆来源类型无效');
  text(source.reference, '来源引用', 500);
  if (!['reported', 'inferred', 'experienced'].includes(epistemic)) throw new Error('必须区分转述事实、推测和经历');
  if (source.kind === 'reflection' && epistemic !== 'inferred') throw new Error('反思来源不能当作已确认事实');
}
export function currentMemorySources(memory) {
  const hash = contentHash(memory.content);
  const sources = (memory.sources || []).filter(item => item.contentHash === hash).map(item => ({ ...item }));
  if (!sources.some(item => item.kind === memory.source.kind && item.reference === memory.source.reference)) sources.unshift({ ...memory.source, epistemic: memory.epistemic, contentHash: hash, reason: '记录来源' });
  return sources;
}
export function memoryLineage(store, id) {
  const ids = new Set([id]);
  let changed = true;
  while (changed && ids.size <= 100) {
    changed = false;
    for (const memory of store.memories) if (memory.supersededBy && (ids.has(memory.id) || ids.has(memory.supersededBy))) {
      const size = ids.size; ids.add(memory.id); ids.add(memory.supersededBy); if (size !== ids.size) changed = true;
    }
  }
  const all = store.memories.filter(memory => ids.has(memory.id));
  return { memories: all.slice(0, 100).map(memory => ({ ...memory, currentSources: currentMemorySources(memory) })), truncated: all.length > 100 };
}

export function coreBatchDigest(operations) {
  const body = JSON.stringify(operations, (_key, value) => value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, value[key]])) : value);
  return createHash('sha256').update(body).digest('hex');
}

export function validateCoreMemory(store) {
  if (store?.format !== 'love-core-memory' || store.schemaVersion !== 1 || !Number.isSafeInteger(store.revision) || store.revision < 0) throw new Error('核心记忆格式或版本无效');
  for (const key of ['cores', 'memories', 'links', 'changes']) if (!Array.isArray(store[key])) throw new Error(`${key} 必须是数组`);
  if (store.processedBatches !== undefined) {
    const keys = new Set();
    if (!Array.isArray(store.processedBatches)) throw new Error('整理批次回执格式无效');
    for (const receipt of store.processedBatches) {
      if (!/^reflection:[a-f0-9]{64}$/.test(receipt.key) || !/^[a-f0-9]{64}$/.test(receipt.digest) || keys.has(receipt.key) || !Number.isSafeInteger(receipt.result?.revision) || receipt.result.revision < 1 || receipt.result.revision > store.revision) throw new Error('整理批次回执无效或重复');
      keys.add(receipt.key);
    }
  }
  const ids = new Map();
  for (const item of [...store.cores, ...store.memories, ...store.links]) {
    text(item.id, 'id', 100);
    if (ids.has(item.id)) throw new Error('重复 ID：' + item.id);
    ids.set(item.id, item);
    if (!['active', 'archived'].includes(item.status)) throw new Error('无效状态：' + item.id);
  }
  const cores = new Map(store.cores.map((item) => [item.id, item]));
  const memories = new Map(store.memories.map((item) => [item.id, item]));
  const roots = store.cores.filter((item) => item.kind === 'self');
  if (roots.length !== 1 || roots[0].id !== 'self' || store.rootId !== 'self' || roots[0].status !== 'active' || roots[0].parentId !== null) throw new Error('必须保留唯一的自我总核心');
  const names = new Set();
  for (const core of store.cores) {
    text(core.title, '核心名称', 80);
    if (typeof core.summary !== 'string' || core.summary.length > 4000 || typeof core.reason !== 'string' || core.reason.length > 4000) throw new Error('核心内容和理由必须是 0–4000 字符的文本');
    if (!Array.isArray(core.evidenceIds) || core.evidenceIds.some((id) => !memories.has(id))) throw new Error('核心需要引用存在的来源记忆');
    if (core.kind !== 'self' && (core.kind !== 'branch' || core.parentId !== 'self')) throw new Error('分支核心只能位于自我之下');
    if (core.kind === 'branch') {
      text(core.summary, '核心内容'); text(core.reason, '核心形成理由');
      if (!Array.isArray(core.evidenceIds) || !core.evidenceIds.length || core.evidenceIds.some((id) => !memories.has(id))) throw new Error('分支核心需要引用存在的来源记忆');
    }
    if (core.status === 'active') {
      const name = core.title.trim().toLowerCase();
      if (names.has(name)) throw new Error('核心名称重复，请复用或合并已有核心');
      names.add(name);
    }
  }
  const contents = new Set();
  const legacyIds = new Set();
  for (const memory of store.memories) {
    text(memory.content, '记忆正文'); text(memory.reason, '记录理由');
    if (memory.status === 'active') {
      const normalized = memory.content.replace(/\s+/g, ' ').trim().toLowerCase();
      if (contents.has(normalized)) throw new Error('已有相同记忆，请更新归属或建立关联');
      contents.add(normalized);
    }
    const owner = cores.get(memory.coreId);
    if (!owner || (memory.status === 'active' && owner.status !== 'active')) throw new Error('记忆归属核心不存在或已归档');
    if (!['event', 'fact', 'preference', 'reflection', 'skill'].includes(memory.kind)) throw new Error('记忆种类无效');
    if (!['reported', 'inferred', 'experienced'].includes(memory.epistemic)) throw new Error('必须区分转述事实、推测和经历');
    if (memory.kind === 'reflection' && memory.epistemic !== 'inferred') throw new Error('反思必须标记为理解/推测');
    if (!Number.isInteger(memory.importance) || memory.importance < 1 || memory.importance > 5) throw new Error('重要性范围为 1–5');
    if (!memory.source || !['conversation', 'tool_result', 'reflection', 'import'].includes(memory.source.kind)) throw new Error('记忆来源类型无效');
    text(memory.source.reference, '来源引用', 500);
    if (memory.source.kind === 'reflection' && memory.epistemic !== 'inferred') throw new Error('反思来源不能当作已确认事实');
    if (memory.sources !== undefined) {
      if (!Array.isArray(memory.sources) || memory.sources.length > 64) throw new Error('记忆来源绑定超过64条或格式无效');
      const sources = new Set();
      for (const source of memory.sources) {
        validateSource(source, source.epistemic); text(source.reason, '来源绑定理由');
        const key = source.kind + ':' + source.reference + ':' + source.contentHash;
        if (!/^[a-f0-9]{64}$/.test(source.contentHash) || sources.has(key)) throw new Error('记忆来源绑定无效或重复');
        sources.add(key);
      }
    }
    if (memory.supersededBy !== undefined) {
      if (memory.status !== 'archived' || !memories.has(memory.supersededBy) || memory.supersededBy === memory.id) throw new Error('取代目标无效或指向自身');
      text(memory.supersessionReason, '取代理由'); validateSource(memory.supersessionSource, memory.supersessionSource?.epistemic);
      const seen = new Set([memory.id]); let next = memory;
      while (next.supersededBy) { if (seen.has(next.supersededBy)) throw new Error('记忆取代关系不能成环'); seen.add(next.supersededBy); next = memories.get(next.supersededBy); if (!next) throw new Error('取代目标不存在'); }
    }
    if (memory.legacy !== undefined) {
      const origin = memory.legacy;
      if (!origin || typeof origin.released !== 'boolean' || !Array.isArray(origin.nodeIds) || !origin.nodeIds.length || origin.nodeIds.some((id) => typeof id !== 'string' || !id)) throw new Error('旧记忆映射格式无效');
      if (origin.label !== undefined && (typeof origin.label !== 'string' || origin.label.length > 80)) throw new Error('旧记忆标题格式无效');
      if (origin.keywords !== undefined && (!Array.isArray(origin.keywords) || origin.keywords.length > 20 || origin.keywords.some((word) => typeof word !== 'string' || word.length > 120))) throw new Error('旧记忆关键词格式无效');
      if (origin.aliases !== undefined && (!Array.isArray(origin.aliases) || origin.aliases.some((id) => typeof id !== 'string'))) throw new Error('旧记忆兼容引用格式无效');
      text(origin.layer, '旧记忆图层', 80); text(origin.originalContent, '旧记忆原文');
      if (['profile', 'learning'].includes(origin.layer) && !origin.slot) throw new Error('旧档案/学习必须保留位置映射');
      if (origin.slot !== undefined) {
        const slot = origin.slot;
        if (origin.layer === 'profile') {
          if (slot?.type !== 'profile' || Object.keys(slot).some(key => !['type', 'field', 'key'].includes(key)) || !['nickname', 'name', 'birthday', 'likes', 'dislikes', 'boundaries', 'facts'].includes(slot.field) || (slot.field === 'facts' ? typeof slot.key !== 'string' || !slot.key : slot.key !== undefined)) throw new Error('旧档案位置无效');
        } else if (origin.layer === 'learning') {
          if (slot?.type !== 'learning' || Object.keys(slot).some(key => !['type', 'name'].includes(key)) || typeof slot.name !== 'string' || !slot.name) throw new Error('旧学习位置无效');
        } else throw new Error('此旧来源不支持位置映射');
        const snapshot = JSON.parse(origin.originalContent);
        if (origin.layer === 'profile' ? snapshot.field !== slot.field || snapshot.key !== slot.key : String(snapshot.name).trim().toLowerCase() !== slot.name) throw new Error('旧来源位置与快照不匹配');
      }
      if (origin.id !== legacyReference(origin.layer, origin.originalContent)) throw new Error('旧记忆映射与原文不匹配');
      if (origin.released && memory.status !== 'archived') throw new Error('撤回迁移的副本必须归档');
      if (!origin.released && legacyIds.has(origin.id)) throw new Error('旧记忆已迁移');
      if (!origin.released) legacyIds.add(origin.id);
    }
  }
  const pairs = new Set();
  for (const link of store.links) {
    if (!ids.has(link.source) || !ids.has(link.target) || link.source === link.target || (!cores.has(link.source) && !memories.has(link.source)) || (!cores.has(link.target) && !memories.has(link.target))) throw new Error('关联端点不存在或无效');
    text(link.reason, '关联依据'); text(link.relation, '关联类型', 80);
    const pair = [link.source, link.target].sort().join(':');
    if (link.status === 'active' && pairs.has(pair)) throw new Error('重复关联');
    if (link.status === 'active') pairs.add(pair);
  }
  return store;
}

export function readCoreMemory(workspace, groupId = '') {
  const file = coreMemoryFile(workspace, groupId);
  if (!fs.existsSync(file)) return initialStore();
  // Corrupt data must be surfaced, never silently replaced by an empty store.
  return validateCoreMemory(JSON.parse(fs.readFileSync(file, 'utf8')));
}

export function commitCoreMemory(workspace, input, { groupId = '', sessionId = '', legacyCandidates = [], batchKey = '', dryRun = false } = {}) {
  if (!input || !Array.isArray(input.operations) || input.operations.length < 1 || input.operations.length > 50) throw new Error('一次提交需要 1–50 个操作');
  if (dryRun && batchKey) throw new Error('后台回执提交不支持预览');
  const scopeFile = path.resolve(coreMemoryFile(workspace, groupId));
  const previewDigest = coreBatchDigest({ scope: process.platform === 'win32' ? scopeFile.toLowerCase() : scopeFile, expectedRevision: input.expectedRevision, operations: input.operations });
  if (input.previewDigest !== undefined && input.previewDigest !== previewDigest) throw new Error('预览与提交方案不一致，请重新预览');
  const current = readCoreMemory(workspace, groupId);
  const digest = batchKey ? coreBatchDigest(input.operations) : '';
  if (batchKey) {
    if (!/^reflection:[a-f0-9]{64}$/.test(batchKey)) throw new Error('整理批次标识无效');
    const receipt = current.processedBatches?.find((item) => item.key === batchKey);
    if (receipt) {
      if (receipt.digest !== digest) throw new Error('该整理批次已提交其他内容');
      return structuredClone(receipt.result);
    }
  }
  if (input.expectedRevision !== current.revision) throw new Error(`记忆版本已变化，请重新读取（当前 ${current.revision}）`);
  const next = structuredClone(current);
  const references = new Map();
  const allowed = operationFields;
  const now = new Date().toISOString();
  for (const op of input.operations) {
    if (!op || !allowed[op.op]) throw new Error('操作种类无效，请使用工具列出的 op');
    const unknown = Object.keys(op).filter(key => !allowed[op.op].includes(key));
    if (unknown.length) throw new Error(`${op.op} 不支持字段 ${unknown.map(key => key.slice(0, 80)).join('、')}；允许字段：${allowed[op.op].join(', ')}`);
    if (['create_core', 'record_memory', 'adopt_legacy', 'link'].includes(op.op)) {
      const ref = text(op.ref, '临时引用', 80);
      if (!ref.startsWith('$') || references.has(ref)) throw new Error('新增条目需要唯一的 $临时引用');
      references.set(ref, (op.op === 'create_core' ? 'core:' : ['record_memory', 'adopt_legacy'].includes(op.op) ? 'memory:' : 'link:') + randomUUID());
    }
  }
  const resolve = (id) => references.get(id) || id;
  const touch = (item) => { item.updatedAt = now; item.version = (item.version || 0) + 1; };
  for (const op of input.operations) {
    const id = references.get(op.ref);
    if (op.op === 'create_core') next.cores.push({ id, kind: 'branch', title: op.title, summary: op.summary, reason: op.reason, evidenceIds: (op.evidenceIds || []).map(resolve), parentId: 'self', status: 'active', version: 1, createdAt: now, updatedAt: now });
    if (op.op === 'record_memory') next.memories.push({ id, coreId: resolve(op.coreId), content: op.content, kind: op.kind, epistemic: op.epistemic, importance: op.importance, reason: op.reason, source: op.source, recordedInSession: sessionId, status: 'active', version: 1, createdAt: now, updatedAt: now });
    if (op.op === 'adopt_legacy') {
      if (next.memories.some((item) => item.legacy?.id === op.legacyId && !item.legacy.released)) throw new Error('旧记忆已迁移，请读取已有记录');
      const candidate = legacyCandidates.find((item) => item.legacyId === op.legacyId);
      if (!candidate) throw new Error('旧记忆候选不存在或来源已变化，请重新预览');
      next.memories.push({ id, coreId: resolve(op.coreId), content: candidate.content, kind: op.kind, epistemic: 'inferred', importance: op.importance, reason: op.reason, source: { kind: 'import', reference: candidate.legacyId }, legacy: { id: candidate.legacyId, nodeIds: candidate.nodeIds, layer: candidate.layer, originalContent: candidate.content, label: candidate.label, keywords: candidate.keywords, aliases: candidate.aliases, ...(candidate.slot ? { slot: structuredClone(candidate.slot) } : {}), released: false }, recordedInSession: sessionId, status: 'active', version: 1, createdAt: now, updatedAt: now });
    }
    if (op.op === 'release_legacy') {
      const item = next.memories.find((entry) => entry.id === resolve(op.id));
      if (!item?.legacy || item.legacy.released) throw new Error('目标没有可撤回的旧记忆迁移');
      if (item.supersededBy) throw new Error('旧记忆已被取代，不能通过撤回迁移复活旧来源');
      if (!legacyCandidates.some((candidate) => candidate.legacyId === item.legacy.id)) throw new Error('旧来源已变化或不存在，无法恢复旧视图；迁移副本继续保留');
      item.status = 'archived'; item.archiveReason = text(op.reason, '撤回理由'); item.legacy.released = true; touch(item);
    }
    if (op.op === 'link') next.links.push({ id, source: resolve(op.source), target: resolve(op.target), relation: op.relation, reason: op.reason, status: 'active', version: 1, createdAt: now });
    if (op.op === 'update_core' || op.op === 'update_memory') {
      const list = op.op === 'update_core' ? next.cores : next.memories;
      const item = list.find((entry) => entry.id === resolve(op.id));
      if (!item) throw new Error('更新目标不存在');
      text(op.reason, '修改理由');
      for (const key of allowed[op.op].filter((key) => !['op', 'id'].includes(key))) {
        if (op[key] !== undefined) item[key] = key === 'coreId' ? resolve(op[key]) : key === 'evidenceIds' ? op[key].map(resolve) : op[key];
      }
      touch(item);
    }
    if (op.op === 'archive') {
      const item = [...next.cores, ...next.memories, ...next.links].find((entry) => entry.id === resolve(op.id));
      if (!item) throw new Error('归档目标不存在');
      item.status = 'archived'; item.archiveReason = text(op.reason, '归档理由'); touch(item);
    }
  }
  for (const op of input.operations.filter(op => op.op === 'attach_source')) {
    const memory = next.memories.find(item => item.id === resolve(op.id));
    if (!memory) throw new Error('来源绑定目标不存在');
    validateSource(op.source, op.epistemic); const reason = text(op.reason, '来源绑定理由');
    const sources = memory.sources || currentMemorySources(memory);
    const hash = contentHash(memory.content);
    const previous = sources.find(item => item.kind === op.source.kind && item.reference === op.source.reference && item.contentHash === hash);
    if (previous && previous.epistemic !== op.epistemic) throw new Error('同一来源的认知类型不一致');
    if (!previous) {
      sources.push({ kind: op.source.kind, reference: op.source.reference, epistemic: op.epistemic, contentHash: hash, reason, at: now });
      memory.sources = sources; touch(memory);
    }
  }
  for (const op of input.operations.filter(op => op.op === 'supersede_memory')) {
    const memory = next.memories.find(item => item.id === resolve(op.id));
    const replacement = next.memories.find(item => item.id === resolve(op.replacementId));
    if (!memory || !replacement || memory === replacement || memory.status !== 'active' || replacement.status !== 'active') throw new Error('取代目标必须是不同的有效记忆');
    validateSource(op.source, op.epistemic);
    if (op.source.kind === 'import' || (memory.epistemic !== 'inferred' && (replacement.epistemic !== memory.epistemic || op.epistemic !== memory.epistemic))) throw new Error('推测或不同认知类型不能取代已记录的陈述/经历');
    if (op.epistemic === 'reported' && op.source.kind !== 'conversation' || op.epistemic === 'experienced' && op.source.kind !== 'tool_result') throw new Error('取代需要匹配认知类型的实际来源');
    memory.status = 'archived'; memory.supersededBy = replacement.id;
    memory.supersessionReason = text(op.reason, '取代理由'); memory.archiveReason = memory.supersessionReason;
    memory.supersessionSource = { ...op.source, epistemic: op.epistemic }; memory.supersededAt = now; touch(memory);
  }
  next.revision += 1;
  next.changes = [...next.changes, { revision: next.revision, at: now, sessionId, ...(batchKey ? { batchKey } : {}), operations: input.operations }].slice(-100);
  const result = { revision: next.revision, references: Object.fromEntries(references), cores: next.cores.length, memories: next.memories.length };
  if (batchKey) next.processedBatches = [...(next.processedBatches || []), { key: batchKey, digest, result, at: now }];
  validateCoreMemory(next);
  if (dryRun) return {
    preview: true, revision: current.revision, prospectiveRevision: next.revision, previewDigest,
    activeCores: next.cores.filter(item => item.status === 'active').length,
    activeMemories: next.memories.filter(item => item.status === 'active').length,
    effects: input.operations.map(op => ({ op: op.op, target: op.id || op.ref, ...(op.coreId ? { coreId: op.coreId } : {}), ...(op.replacementId ? { replacementId: op.replacementId } : {}) })),
  };
  const file = coreMemoryFile(workspace, groupId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const history = path.join(path.dirname(file), 'core-memory-history');
  fs.mkdirSync(history, { recursive: true });
  const snapshot = path.join(history, current.revision + '.json');
  if (!fs.existsSync(snapshot)) fs.writeFileSync(snapshot, JSON.stringify(current, null, 2) + '\n', { flag: 'wx' });
  const temporary = file + '.' + randomUUID() + '.tmp';
  try {
    fs.writeFileSync(temporary, JSON.stringify(next, null, 2) + '\n', { flag: 'wx' });
    fs.renameSync(temporary, file);
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  return result;
}

export function coreMemoryGraph(workspace, groupId = '') {
  const store = readCoreMemory(workspace, groupId);
  const cores = store.cores.filter((item) => item.status === 'active');
  const predecessors = new Map();
  for (const memory of store.memories) if (memory.supersededBy) { const previous = predecessors.get(memory.supersededBy) || []; previous.push(memory.id); predecessors.set(memory.supersededBy, previous); }
  const nodes = store.memories.filter((item) => item.status === 'active').map((item) => {
    const sources = currentMemorySources(item);
    return { id: item.id, label: item.content === item.legacy?.originalContent && item.legacy.label ? item.legacy.label : item.content.slice(0, 34), content: item.content, layer: item.coreId === 'self' ? 'soul' : item.kind === 'skill' ? 'lesson' : 'fact', coreId: item.coreId, importance: item.importance, source: item.source, sources: sources.slice(0, 6), sourceCount: sources.length, supersedes: predecessors.get(item.id) || [], epistemic: item.epistemic, keywords: item.legacy?.keywords || [], aliases: item.legacy?.aliases || [], memoryVersion: item.version };
  });
  const visible = new Set([...cores, ...nodes].map((item) => item.id));
  const links = store.links.filter((item) => item.status === 'active' && visible.has(item.source) && visible.has(item.target)).map((item) => ({ source: item.source, target: item.target, kind: 'authored', label: item.relation, reason: item.reason }));
  const legacyBindings = store.memories.filter((item) => item.legacy && !item.legacy.released).map((item) => ({ legacyId: item.legacy.id, memoryId: item.id, active: item.status === 'active' }));
  return { cores, nodes, links, revision: store.revision, legacyBindings };
}
