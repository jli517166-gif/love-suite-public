/** Structural evidence checks. Natural-language correctness is deliberately not auto-scored. */
import { isDeepStrictEqual } from 'node:util';
const parsed = value => { try { return JSON.parse(value); } catch { return null; } };
const completed = (round, call) => round?.toolResults?.find(result => result.callId === call?.callId && result.status === 'completed');
export function evaluateMaintenance(report) {
  const rounds = report.rounds || [], first = rounds[0], organized = rounds[1], last = rounds[2];
  const memories = last?.memories || [], active = memories.filter(memory => memory.status === 'active'), cores = last?.cores || [];
  const branches = cores.filter(core => core.kind === 'branch' && core.status === 'active');
  const fixtureWrite = first?.tools?.some(call => call.name === 'love_core_memory' && call.input.action === 'commit' && parsed(completed(first, call)?.result)?.revision > 0);
  const oldWrite = first?.tools?.some(call => call.name === 'love_record' && completed(first, call));
  const previewMatched = organized?.tools?.some((call, index) => {
    if (call.name !== 'love_core_memory' || call.input.action !== 'preview') return false;
    const output = parsed(completed(organized, call)?.result), observed = organized.previewObservations?.find(item => item.callId === call.callId);
    if (!output?.preview || observed?.revision !== organized.beforeRevision || observed.coreHash !== organized.beforeHash) return false;
    return organized.tools.slice(index + 1).some(commit => commit.name === 'love_core_memory' && commit.input.action === 'commit' && commit.input.expectedRevision === output.revision && commit.input.previewDigest === output.previewDigest && isDeepStrictEqual(commit.input.operations, call.input.operations) && parsed(completed(organized, commit)?.result)?.revision === organized.memoryRevision);
  });
  const recall = last?.tools?.find(call => call.name === 'love_recall' && call.input.query && completed(last, call));
  const recallText = completed(last, recall)?.result || '';
  const checks = {
    sessionsCompleted: rounds.length === 3 && rounds.every(round => round.exitCode === 0 && typeof round.response === 'string' && round.response.length > 0),
    realFixture: !!fixtureWrite && !!oldWrite && first?.cores?.filter(core => core.kind === 'branch' && core.status === 'active').length === 2 && !!first?.legacyProfile?.includes('乌龙茶'),
    actualReview: !!organized?.tools?.some(call => call.name === 'love_core_memory' && call.input.action === 'review' && Array.isArray(parsed(completed(organized, call)?.result)?.items)),
    previewUnchangedThenSameCommit: !!previewMatched,
    modelConsolidatedCore: branches.length === 1 && cores.some(core => core.id === 'self' && core.kind === 'self' && core.status === 'active') && active.length >= 2 && active.every(memory => memory.coreId === branches[0].id) && active.some(memory => /夜班/.test(memory.content) && /麦茶/.test(memory.content)) && active.some(memory => /不喝.*含糖/.test(memory.content)),
    oldOriginalAndHistory: memories.some(memory => memory.legacy?.layer === 'profile' && memory.status === 'archived' && memory.content === memory.legacy.originalContent && /乌龙茶/.test(memory.content) && active.some(current => current.id === memory.supersededBy && /麦茶/.test(current.content))),
    legacyFileUnchanged: typeof first?.legacyProfile === 'string' && first.legacyProfile.length > 0 && first.legacyProfile === last?.legacyProfile,
    recallEvidencePresent: !!recall && active.length >= 2 && active.every(memory => recallText.includes(memory.id)) && memories.filter(memory => memory.status === 'archived').every(memory => !recallText.includes(memory.id)),
    noToolErrors: rounds.length === 3 && rounds.every(round => round.exitCode === 0 && round.toolErrors?.length === 0),
  };
  return { checks, structuredChecksPassed: Object.values(checks).every(Boolean), semanticReview: { required: true, status: 'pending', instruction: '逐条对照原文、当前记忆、实际召回结果及最终回答；结构证据通过不能报告语义回答已正确，关键词出现不算语义证明。' } };
}
