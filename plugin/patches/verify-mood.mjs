import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { recomputeMood } from '../index.js';

function fixture(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'love-mood-check-'));
  const memory = path.join(root, 'memory');
  fs.mkdirSync(path.join(memory, 'journal'), { recursive: true });
  const write = (name, data) => fs.writeFileSync(path.join(memory, name), JSON.stringify(data));
  try { run(root, write); } finally {
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    fs.rmSync(root, { recursive: true, force: true });
  }
}
const today = new Date().toISOString().slice(0, 10);
const cases = [
  ['正向好感不能被用于解释委屈，旧原因会迁移', () => fixture((root, write) => {
    write('relationship.json', { affection: 8, feeling_log: [{ date: today, delta: 1 }] });
    write('mood.json', { emotion: '委屈', intensity: 0.7, causes: ['最近的好感在涨'], updated: new Date().toISOString(), last_triggered: new Date().toISOString() });
    for (const random of [0, 0.2, 0.5, 0.8, 0.999]) {
      const mood = recomputeMood(root, true, () => random);
      assert.equal(mood.reason_schema, 2);
      assert.ok(!['委屈', '难过', '生气', '不安'].includes(mood.emotion));
      if (mood.emotion === '开心') assert.ok(mood.causes.some((cause) => cause.includes('好感')));
      else assert.ok(!mood.causes.some((cause) => cause.includes('好感')));
    }
  })],
  ['委屈只使用对应的受挫证据', () => fixture((root, write) => {
    write('relationship.json', { affection: 4, feeling_log: [{ date: today, delta: -1 }] });
    const mood = recomputeMood(root, true, () => 0.999);
    assert.equal(mood.emotion, '委屈');
    assert.deepEqual(mood.causes, ['最近的互动让关系有些受挫']);
  })],
  ['没有触发事件时不会随机生成委屈或生气', () => fixture((root) => {
    for (const random of [0.1, 0.5, 0.99]) {
      const mood = recomputeMood(root, true, () => random);
      assert.ok(['平静', '想念'].includes(mood.emotion));
      assert.ok(mood.causes.length);
    }
  })],
  ['已过期的好感记录不再解释为最近上涨', () => fixture((root, write) => {
    write('relationship.json', { affection: 30, feeling_log: [{ date: '2000-01-01', delta: 2 }] });
    assert.ok(!recomputeMood(root, true, () => 0.9).causes.some((cause) => /好感|增长/.test(cause)));
  })],
  ['情绪衰减平静后清理旧原因', () => fixture((root, write) => {
    write('mood.json', { reason_schema: 2, emotion: '开心', intensity: 0.4, causes: ['最近的好感在涨'], updated: new Date(Date.now() - 3 * 86400000).toISOString(), last_triggered: new Date().toISOString() });
    const mood = recomputeMood(root, false, () => 0.9);
    assert.equal(mood.emotion, '平静');
    assert.deepEqual(mood.causes, ['之前的情绪已逐渐平复']);
  })],
];
for (const [label, check] of cases) { check(); console.log('ok   心情一致性：' + label); }
