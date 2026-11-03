/** Opt-in real worker driver with text-output evidence. Never loaded by normal installation. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createReflectionWorker } from '../reflection-worker.js';
export const name = 'love-live-quality-fixture';
export const inject = ['llm'];
export function apply(ctx) {
  const root = path.resolve(process.env.LOVE_LIVE_TEST_ROOT || '.');
  if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('love-live-background-quality-')) throw new Error('质量验收必须使用独立临时目录');
  const workspace = path.join(root, 'workspace'), marker = JSON.parse(fs.readFileSync(path.join(root, 'fixture.json'), 'utf8'));
  if (marker.format !== 'love-live-background-fixture' || marker.workspace !== workspace) throw new Error('缺少隔离验收标记');
  const service = { async prepareCall(...args) {
    const prepared = await ctx.llm.prepareCall(...args);
    return { ...prepared, async *stream(...streamArgs) {
      let output = '';
      try { for await (const event of prepared.stream(...streamArgs)) { if (event.type === 'text-delta') output += event.text || ''; yield event; } }
      finally { fs.writeFileSync(path.join(root, `worker-output-${Date.now()}.json`), JSON.stringify({ format: 'love-quality-worker-output', text: output }, null, 2)); }
    } };
  } };
  const worker = createReflectionWorker({ llm: () => service, scopes: () => [{ primary: workspace, workspace, groupId: '' }], config: () => ({ reflectionEnabled: true, reflectionBackgroundEnabled: true, reflectionCooldownMinutes: 1, reflectionMaxCallsPerDay: 6, reflectionMaxOutputTokens: 4096 }) });
  let driven = false;
  const dispose = ctx.on('agent/pre-step', async (payload, next) => {
    if (!driven && path.resolve(payload?.agent?.session?.header?.cwd || '.') === workspace) { driven = true; await worker.tick(); }
    return next();
  });
  return async () => { dispose?.(); await worker.stop(); };
}
