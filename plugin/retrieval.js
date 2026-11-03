/**
 * 本地检索：中文 bigram + 英文单词，BM25 打分，带轻微新近加权。
 *
 * 语义是规则层的：同义词扩展 + 文本去重，不引模型、不联网。
 */

/** 本地语义扩展：把查询扩一层同义词，扩展词权重 0.6。 */
const SYNONYM_GROUPS = [
  ["开心", "高兴", "快乐", "愉快"],
  ["难过", "伤心", "低落", "不开心"],
  ["生气", "愤怒", "恼火"],
  ["害怕", "不安", "紧张", "焦虑"],
  ["喜欢", "中意", "偏爱", "爱好"],
  ["讨厌", "反感", "不喜欢"],
  ["工作", "上班", "项目", "任务"],
  ["学习", "学会", "掌握"],
  ["记忆", "回忆", "记得", "想起"],
  ["朋友", "好友", "伙伴"],
  ["群", "群聊", "群里"],
  ["睡觉", "困", "休息"],
];

function expandQuery(tokens) {
  const weights = new Map(tokens.map((token) => [token, 1]));
  for (const token of tokens) {
    for (const group of SYNONYM_GROUPS) {
      if (!group.includes(token)) continue;
      for (const word of group) {
        if (word !== token && !weights.has(word)) weights.set(word, 0.6);
      }
    }
  }
  return weights;
}

/** 保留词频，中文只在连续文本内分词，避免跨空格/标点制造虚假词。 */
function tokenize(text) {
  const source = String(text || "").toLowerCase();
  const tokens = [];
  for (const run of source.match(/[a-z0-9]+|[\u4e00-\u9fff]+/g) || []) {
    if (/^[a-z0-9]+$/.test(run)) {
      if (run.length >= 2) tokens.push(run);
      continue;
    }
    if (run.length === 1) tokens.push(run);
    // Match longer synonyms explicitly; negated preferences must not become likes.
    const negativeSpans = [...run.matchAll(/不开心|不喜欢/g)].map((match) => [match.index, match.index + match[0].length]);
    for (let i = 0; i < run.length - 1; i++) {
      if (!negativeSpans.some(([start, end]) => i >= start && i + 2 <= end)) tokens.push(run.slice(i, i + 2));
    }
    for (const group of SYNONYM_GROUPS) {
      for (const word of group) {
        if (word.length === 2) continue;
        let start = 0, at;
        while ((at = run.indexOf(word, start)) !== -1) {
          tokens.push(word);
          start = at + word.length;
        }
      }
    }
  }
  return tokens;
}

/** 外部关键词接口继续返回唯一词；排序内部使用未去重的词频。 */
export function recallTokens(text) {
  return [...new Set(tokenize(text))];
}

/**
 * BM25 排序；同分时越靠后（越新）越前。
 * @param {Array} items 条目（按时间升序传入效果最好）
 * @param {string} query 检索词
 * @param {(item: any) => string} textOf 取文本
 * @param {number} limit 返回条数
 */
export function rankByQuery(items, query, textOf, limit = 5) {
  limit = Number.isFinite(Number(limit)) ? Math.max(0, Math.trunc(Number(limit))) : 5;
  if (!limit) return [];
  const wanted = recallTokens(query);
  const weights = expandQuery(wanted);
  const docs = (items || []).map((item, index) => {
    const text = String(textOf ? textOf(item) : item?.text || item);
    const tokens = tokenize(text);
    const tf = new Map();
    for (const token of tokens) tf.set(token, (tf.get(token) || 0) + 1);
    const exact = text.replace(/\s+/g, " ").trim().toLowerCase() === String(query || "").replace(/\s+/g, " ").trim().toLowerCase();
    return { item, index, tf, exact, length: Math.max(1, tokens.length) };
  });
  if (!wanted.length) return docs.slice(-limit).reverse().map((row) => row.item);
  if (!docs.length) return [];

  const total = docs.length;
  const average = docs.reduce((sum, row) => sum + row.length, 0) / total || 1;
  const k1 = 1.2;
  const b = 0.75;
  const df = new Map([...weights.keys()].map((token) => [token, docs.filter((row) => row.tf.has(token)).length]));

  const scored = docs.map((row) => {
    let score = 0;
    for (const [token, weight] of weights) {
      const frequency = row.tf.get(token) || 0;
      if (!frequency) continue;
      const idf = Math.log(1 + (total - df.get(token) + 0.5) / (df.get(token) + 0.5));
      score += weight * idf * (frequency * (k1 + 1)) / (frequency + k1 * (1 - b + b * row.length / average));
    }
    // 越新越占一点点便宜（0–15%），避免旧事把新事压掉
    if (score > 0 && total > 1) score *= 1 + 0.15 * (row.index / (total - 1));
    return { ...row, score };
  }).filter((row) => row.score > 0);

  // A complete match wins over keyword repetition or the small recency boost.
  scored.sort((a, b2) => Number(b2.exact) - Number(a.exact) || b2.score - a.score || b2.index - a.index);

  // 同一段文本只留最高分一条，避免重复记忆刷屏
  const seen = new Set();
  const result = [];
  for (const row of scored) {
    const text = String(textOf ? textOf(row.item) : row.item?.text || row.item).replace(/\s+/g, " ").trim().toLowerCase();
    if (text && seen.has(text)) continue;
    if (text) seen.add(text);
    result.push(row.item);
    if (result.length >= limit) break;
  }
  return result;
}
