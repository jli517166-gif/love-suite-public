/** In-memory activation diagnostics; never retain source material or session identifiers. */
import path from 'node:path';
export function createReflectionHealth({ now = Date.now } = {}) {
  const startedAt = now(), scopes = new Map();
  let outsideScopeTurns = 0;
  const fresh = () => ({ scopedTurns: 0, queuedBatches: 0, disabledTurns: 0, errorCount: 0, overflowCount: 0, lastEventAt: null, lastQueuedAt: null, lastError: '' });
  const keyOf = workspace => process.platform === 'win32' ? path.resolve(workspace).toLowerCase() : path.resolve(workspace);
  return {
    outside() { outsideScopeTurns++; },
    record(workspace, result, { collect = true, error = false } = {}) {
      const key = keyOf(workspace);
      if (!scopes.has(key)) { if (scopes.size >= 64) scopes.delete(scopes.keys().next().value); scopes.set(key, fresh()); }
      const state = scopes.get(key);
      state.scopedTurns++; state.lastEventAt = now();
      if (!collect) state.disabledTurns++;
      if (error) { state.errorCount++; state.lastError = '材料收集失败，请查看宿主日志'; }
      const queued = Number.isSafeInteger(result?.queued) && result.queued > 0 ? result.queued : 0;
      state.queuedBatches += queued;
      if (queued) state.lastQueuedAt = now();
      if (result?.overflow) state.overflowCount++;
    },
    describe(workspace) { return { startedAt, outsideScopeTurns, ...(scopes.get(keyOf(workspace)) || fresh()) }; },
  };
}
