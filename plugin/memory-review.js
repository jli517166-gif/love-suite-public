/** Bounded read-only hints. Lexical overlap never decides facts or performs maintenance. */
import { coreBatchDigest, currentMemorySources } from './core-memory.js';
import { legacyCandidates } from './legacy-memory.js';
import { recallTokens, rankByQuery } from './retrieval.js';
const PAGE = 5, CARD_BYTES = 24000;
const normalize = value => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
function searchable(record) {
  if (record.layer === 'profile') {
    try { const data = JSON.parse(record.content); return `${({ likes: '喜欢', dislikes: '不喜欢', boundaries: '边界' })[data.field] || data.field} ${data.key || ''} ${data.value || ''}`; } catch {}
  }
  return record.content;
}
export function reviewMemoryCandidates(store, graph, { query = '', offset = 0 } = {}) {
  const active = store.memories.filter(item => item.status === 'active');
  const cores = store.cores.filter(item => item.status === 'active');
  const legacy = legacyCandidates(graph, store);
  const wanted = String(query).trim(), hasTerms = recallTokens(wanted).length > 0;
  const choose = (items, textOf, max) => wanted ? hasTerms ? rankByQuery(items, wanted, textOf, max) : [] : items.slice(-max);
  const memories = choose(active, item => item.content, 128);
  const old = choose(legacy.candidates, item => searchable(item), 128);
  const branch = choose(cores.filter(core => core.kind !== 'self'), core => `${core.title} ${core.summary}`, 64);
  const records = [
    ...memories.map(memory => ({ id: memory.id, recordType: 'memory', layer: memory.legacy?.layer || 'core', content: memory.content, epistemic: memory.epistemic,
      coreId: memory.coreId, coreTitle: cores.find(core => core.id === memory.coreId)?.title,
      sources: currentMemorySources(memory).slice(0, 6), sourceCount: currentMemorySources(memory).length, sourcesComplete: currentMemorySources(memory).length <= 6, contentComplete: true, complete: currentMemorySources(memory).length <= 6 })),
    ...old.map(item => ({ id: item.legacyId, legacyId: item.legacyId, recordType: 'legacy', layer: item.layer, content: item.content, title: item.label, epistemic: 'inferred',
      sources: [{ kind: 'import', reference: item.legacyId }], sourceCount: 1, sourcesComplete: true, contentComplete: true, complete: true })),
  ];
  const items = [], pairs = new Set(), tokens = new Map(), index = new Map();
  for (const record of records) {
    const terms = new Set(recallTokens(searchable(record)).slice(0, 64)); tokens.set(record.id, terms);
    for (const term of terms) { const list = index.get(term) || []; if (list.length < 32) list.push(record); index.set(term, list); }
  }
  const add = (kind, ids, reason, extra = {}) => items.push({ id: 'review:' + coreBatchDigest([kind, ...ids]).slice(0, 24), kind, recordIds: ids, reason, ...extra });
  let pairLimitReached = false;
  outer: for (const a of records) {
    const candidates = new Set([...tokens.get(a.id)].flatMap(term => index.get(term) || []));
    for (const b of candidates) {
      if (a === b) continue;
      const ids = [a.id, b.id].sort(), key = ids.join('\0');
      if (pairs.has(key)) continue;
      const shared = [...tokens.get(a.id)].filter(term => tokens.get(b.id).has(term));
      const duplicate = normalize(a.content) === normalize(b.content);
      if (!duplicate && (shared.length < 2 || shared.length / Math.max(1, Math.min(tokens.get(a.id).size, tokens.get(b.id).size)) < .3)) continue;
      pairs.add(key);
      add(duplicate ? 'duplicate_candidate' : 'possible_overlap', ids, duplicate ? '正文相同，仍需核对主体、来源与归属。' : '字面相关，可能是重复、变化、条件或主体差异；必须读原文判断，不能自动取代。', { sharedTerms: shared.slice(0, 6) });
      if (pairs.size >= 128) { pairLimitReached = true; break outer; }
    }
  }
  const coreRecords = branch.map(core => ({ id: core.id, recordType: 'core', title: core.title, content: core.summary, contentComplete: true, complete: core.evidenceIds.length <= 20, evidenceIds: core.evidenceIds.slice(0, 20), evidenceCount: core.evidenceIds.length, evidenceComplete: core.evidenceIds.length <= 20 }));
  for (const core of branch) if (!active.some(memory => memory.coreId === core.id)) add('empty_core', [core.id], '没有有效子记忆的分支核心；是否保留由你决定，self不在候选中。');
  let relatedCount = pairs.size;
  corePairs: for (let i = 0; i < branch.length; i++) for (let j = i + 1; j < branch.length; j++) {
    if (relatedCount >= 128) { pairLimitReached = true; break corePairs; }
    const a = branch[i], b = branch[j], left = new Set(recallTokens(`${a.title} ${a.summary}`).slice(0, 64)), right = new Set(recallTokens(`${b.title} ${b.summary}`).slice(0, 64));
    const shared = [...left].filter(term => right.has(term));
    if (shared.length >= 2 && shared.length / Math.max(1, Math.min(left.size, right.size)) >= .3) { add('core_overlap', [a.id, b.id], '核心描述有字面重合；合并前逐条核对有效子记忆，移动后才可归档空分支。'); relatedCount++; }
  }
  for (const item of old) add('legacy_adoption', [item.legacyId], '未迁移旧记录，可选择归属或继续保留；存在不代表当前真实，不能把旧值自动覆盖到新值。');
  const all = new Map([...records, ...coreRecords].map(record => [record.id, record]));
  offset = Number.isSafeInteger(offset) && offset >= 0 ? offset : 0;
  const page = items.slice(offset, offset + PAGE), cards = new Map();
  for (const item of page) {
    const added = item.recordIds.filter(id => !cards.has(id)).map(id => all.get(id));
    if (Buffer.byteLength(JSON.stringify([...cards.values(), ...added])) <= CARD_BYTES) {
      for (const card of added) cards.set(card.id, card);
      item.requiresRead = item.recordIds.some(id => !all.get(id)?.complete);
    } else item.requiresRead = true;
  }
  return { revision: store.revision, items: page, records: [...cards.values()], nextOffset: offset + page.length < items.length ? offset + page.length : null,
    coverage: { coreMemoriesTotal: active.length, coreMemoriesScanned: memories.length, legacyTotal: legacy.candidates.length, legacyScanned: old.length,
      coresTotal: cores.length - 1, coresScanned: branch.length, excludedLongLegacy: legacy.excluded.length, candidateCount: items.length, pairLimitReached, cardByteLimit: CARD_BYTES },
    warning: '候选仅为有界字面提示，不是语义冲突或真伪判定。requiresRead表示本页正文、来源或依据不全，必须按recordIds补读。旧记录只保留导入依据；preview不写入，commit才保存。' };
}
