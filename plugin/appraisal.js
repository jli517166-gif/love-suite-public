/**
 * 自动 appraisal：从对话里读出「值得记一笔」的信号，给关系一点自然的变化。
 *
 * 为什么需要：模型经常忘记调 `love_record kind=feeling`（实测一整晚好感停在 5），
 * 关系于是永远停在初识。这里用保守的正则兜底：一次最多 ±1，有每日上限和冷却，
 * 宁可漏判也不乱涨。
 *
 * 关键细节：入站文本里可能有 `[QQ表情:319 比心｜双手比心，喜欢/亲昵]` 这种注解，
 * 其中的「喜欢」不是用户说的，必须先剥掉再判断。
 */

const POSITIVE = [
  /好可爱|真可爱|太可爱/,
  /喜欢你|爱你/,
  /抱抱|摸摸|亲亲/,
  /想你了|想你啦/,
  /谢谢你|辛苦了/,
  /好棒|最好了|真乖|乖~/,
];

const NEGATIVE = [
  /滚(?:开|蛋)?/,
  /闭嘴/,
  /烦死|别烦我/,
  /讨厌你/,
  /不理你/,
  /骗我|失约/,
  /你走开/,
];

const NEGATION = /[不别没勿未]/;

/** 去掉 QQ 表情注解、图片/引用占位，只留下用户真正打的字。 */
export function stripMarkers(text) {
  return String(text ?? "")
    .replace(/\[QQ表情:[^\]]*\]/g, "")
    .replace(/\[QQ表情包:[^\]]*\]/g, "")
    .replace(/\[图片:[^\]]*\]/g, "")
    .replace(/\[引用\]/g, "")
    .trim();
}

function findWithIndex(text, regex) {
  const match = regex.exec(text);
  if (!match) return null;
  return { index: match.index, phrase: match[0] };
}

/** 关键词前面 4 个字内有否定词 = 翻转（"不喜欢你" 不算喜欢）。 */
function negatedNear(text, index) {
  const before = text.slice(Math.max(0, index - 4), index);
  return NEGATION.test(before);
}

/**
 * 判断一句话的情绪倾向。
 * @param {string} text 用户原话（可含表情注解，会被剥掉）
 * @returns {{delta: number, tag: string | null, phrase: string | null}}
 */
export function appraise(text) {
  const clean = stripMarkers(text);
  if (!clean) return { delta: 0, tag: null, phrase: null };

  for (const regex of NEGATIVE) {
    const hit = findWithIndex(clean, regex);
    if (hit && !negatedNear(clean, hit.index)) {
      return { delta: -1, tag: "negative", phrase: hit.phrase };
    }
  }
  for (const regex of POSITIVE) {
    const hit = findWithIndex(clean, regex);
    if (hit && !negatedNear(clean, hit.index)) {
      return { delta: 1, tag: "positive", phrase: hit.phrase };
    }
  }
  return { delta: 0, tag: null, phrase: null };
}
