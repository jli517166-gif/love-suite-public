import assert from 'node:assert/strict';
import { recallTokens, rankByQuery } from '../retrieval.js';

const textOf = (item) => item.text;
const cases = [
  ['分词不跨标点、空格和中英文边界', () => {
    const tokens = recallTokens('工作，学习 English 中文');
    assert.ok(tokens.includes('工作') && tokens.includes('学习') && tokens.includes('english'));
    assert.ok(!tokens.includes('作学') && !tokens.includes('习中'));
  }],
  ['否定短语不产生正向词', () => {
    assert.deepEqual(recallTokens('不开心'), ['不开心']);
    assert.deepEqual(recallTokens('不喜欢'), ['不喜欢']);
  }],
  ['否定短语可扩展到对应情绪同义词', () => {
    const result = rankByQuery([{ text: '开心' }, { text: '伤心' }], '不开心', textOf);
    assert.deepEqual(result.map(textOf), ['伤心']);
  }],
  ['保留实际词频', () => {
    const repeated = { text: '尾巴尾巴abc' };
    const result = rankByQuery([repeated, { text: '尾巴苹果abc' }], '尾巴', textOf);
    assert.equal(result[0], repeated);
  }],
  ['完整匹配优先于重复词和新近权重', () => {
    const exact = { text: '尾巴' };
    assert.equal(rankByQuery([exact, { text: '今天尾巴'.repeat(10) }], '尾巴', textOf)[0], exact);
  }],
  ['零条限制与无命中返回空', () => {
    assert.deepEqual(rankByQuery([{ text: '尾巴' }], '尾巴', textOf, 0), []);
    assert.deepEqual(rankByQuery([{ text: '尾巴' }], '飞机', textOf), []);
  }],
  ['重复文本保留较新的条目', () => {
    const latest = { text: '阿云 尾巴' };
    assert.deepEqual(rankByQuery([{ text: '阿云 尾巴' }, latest], '阿云', textOf), [latest]);
  }],
];
for (const [label, check] of cases) {
  check();
  console.log('ok   检索：' + label);
}
