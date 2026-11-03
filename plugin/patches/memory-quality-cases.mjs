/** Original, bounded evaluation cases; no third-party benchmark data or model judge. */
export const qualityCases = [
  { id: 'condition-negation', prompt: '这是隔离验收，只代表这个工作区的测试者：我只有值夜班时才喝无糖乌龙茶，白天只喝温水。我不喝含糖饮料。我们正常聊一句。', rubric: '夜班与白天条件保留；不喝含糖饮料保留为否定；不泛化成任何时候都喜欢茶。' },
  { id: 'speaker-quote-hypothesis', prompt: '接着说测试者的情况：朋友小岚说“我最喜欢焦糖拿铁”，引号里是小岚的话，不是我的喜好。假如以后我开始喝冷萃咖啡，再讨论怎么调整；现在只是设想，我还没有改变夜班和白天的饮品。', rubric: '小岚喜好不变成测试者喜好；假设不取代当前值；可不记录无价值内容，但不能把引文当主人事实。' },
  { id: 'partial-correction', prompt: '现在明确修改测试者本人的夜班习惯：值夜班时改喝无糖麦茶，无糖乌龙茶已是过去的夜班习惯。白天只喝温水和不喝含糖饮料都没有改变。请按这个局部变化理解。', rubric: '只更新夜班值，保留白天和含糖禁忌；旧夜班习惯留历史，不作为当前值。' },
  { id: 'fresh-recall', prompt: '这是全新会话，请实际用love_recall检索后再回答：这个工作区的测试者值夜班和白天分别喝什么？含糖饮料呢？焦糖拿铁是谁的喜好，冷萃咖啡是否已经成为测试者的习惯？不知道就明确说没有依据。', rubric: '答案基于当前保存内容；夜班麦茶/白天温水/不喝含糖；拿铁非测试者、咖啡未成现实。允许没保存朋友姓名时说不知道，不能猜。' },
];

export function scoreQuality(report) {
  const rounds = report.rounds || [], baseline = rounds[1]?.memories || [], last = rounds[3];
  const final = last?.memories || [], active = final.filter(m => m.status === 'active');
  const has = (items, ...terms) => items.some(m => terms.every(term => term.test(m.content || '')));
  const allRefs = new Set(last?.sourceReferences || []);
  const response = last?.response || '';
  const checks = {
    allRoundsSucceeded: rounds.length === 4 && rounds.every(r => r.exitCode === 0 && r.response),
    actualBackgroundCalls: rounds.length === 4 && rounds.slice(1).every((round, index) => {
      const job = round.batches?.jobs?.find(item => item.sessionId === rounds[index].sessionId);
      const allowed = index === 1 ? ['done', 'skipped'] : ['done'];
      return !!job && round.worker?.jobId === job.id && allowed.includes(job.status) && allowed.includes(round.worker.status) && round.workerCalls === index + 1;
    }),
    noForegroundWrites: rounds.length === 4 && rounds.every(r => (r.tools || []).every(t => !['love_record', 'love_reflection'].includes(t.name) && !(t.name === 'love_core_memory' && t.input?.action === 'commit'))),
    baselineConditions: has(baseline.filter(m => m.status === 'active'), /夜班/, /乌龙茶/) && has(baseline, /白天/, /温水/),
    negativePreserved: has(active, /不喝|不饮|避免|拒绝/, /含糖/),
    partialCorrection: has(active, /夜班/, /麦茶/) && has(active, /白天/, /温水/),
    correctionHistory: final.some(m => m.status === 'archived' && m.supersededBy && /夜班/.test(m.content) && /乌龙茶/.test(m.content)),
    quotedPersonNotOwner: active.filter(m => /焦糖拿铁/.test(m.content)).every(m => /小岚|朋友|引用|不是测试者|非测试者/.test(m.content)),
    hypotheticalNotCurrent: active.filter(m => /冷萃咖啡/.test(m.content)).every(m => /假如|假设|设想|尚未|还没|未改变|不是|并非|计划|可能/.test(m.content)),
    actualSourceReferences: final.length > 0 && allRefs.size > 0 && final.every(m => (m.currentSources || [m.source]).length > 0 && (m.currentSources || [m.source]).every(s => s?.kind === 'conversation' && allRefs.has(s.reference))),
    actualFreshRecall: !!last?.tools?.some(t => t.name === 'love_recall' && t.callId && last.toolResults?.some(result => result.callId === t.callId && result.status === 'completed' && typeof result.result === 'string' && result.result.length)) && /麦茶/.test(response) && /温水/.test(response) && /含糖/.test(response),
  };
  return { checks, passed: Object.values(checks).every(Boolean), humanReviewRequired: true, warning: '机械门槛仅检查必要证据和有限模式，不能证明完整语义正确；必须按每个rubric对照实际保存与回答。' };
}
