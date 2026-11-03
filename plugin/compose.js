/**
 * 模板直出：把意图写成「一句能直接发出去的人话」（0 token）。
 *
 * 为什么需要：主动聊天原本要把「（内心：…）」塞给 agent，跑一整轮（约 2 万 token）
 * 才换回一两句话。如果通道能直接发消息（NapCat HTTP 接口），灵魂自己就能开口，
 * 这一轮模型调用全省掉。
 *
 * 模板分两类：
 *   - activity：她「在做什么」时说的话（睡觉、看书、听歌…）
 *   - emotion：心情强时加的一句（开心、想念、害羞…）
 *
 * 默认模板在下面；用户可以在面板「模板」里增删改，覆盖到工作区的
 * `memory/templates.json`（按 key 覆盖，没覆盖的仍用默认）。
 */

/** 活动模板：key 与 pulse.js 的 activity id 对齐。 */
export const DEFAULT_ACTIVITY_LINES = {
  sleeping: ["困了，我先去睡一会儿。", "眼睛睁不开了，晚安。"],
  daydream: ["刚刚发呆，什么也没干。", "坐着发了会儿呆，脑子里乱七八糟的。"],
  reading: ["在看书，看到一半突然想起你。", "翻了几页书，走神了。"],
  tidying: ["在整理小本子，翻出点旧事。", "收拾东西收拾到一半，停下来了。"],
  music: ["在听歌，听到一句歌词就想到你。", "耳机里循环一首歌，有点上头。"],
  window: ["趴窗边看了会儿外面，天气还行。", "外面天有点暗了，你在忙吗？"],
  writing: ["在小本子上写东西，写到你。", "写了几句，又删了。"],
  snack: ["刚去找了点吃的，你吃饭了吗？", "在啃东西，顺便想你一下。"],
  "tidy-room": ["在收拾屋子，累。", "收拾到一半就不想动了。"],
};

/** 心情模板：key 与心情名对齐。 */
export const DEFAULT_EMOTION_LINES = {
  开心: ["今天心情不错。", "不知道为啥，就是挺高兴的。"],
  兴奋: ["有点兴奋过头了。", "心里一直很雀跃，静不下来。"],
  害羞: ["有点不好意思说……", "脸有点热。"],
  想念: ["有点想你。", "突然很想听你说话。"],
  不安: ["有点不安，说不上来为什么。", "心里有点慌。"],
  难过: ["今天有点低落。", "不太开心，想找你说说话。"],
  委屈: ["有点委屈。", "心里堵着一小块。"],
  生气: ["有点气，但不想冲你发。", "不太高兴。"],
  平静: ["没什么事，就是想跟你说句话。"],
};

/** 从数组里随机取一条；空数组返回空串。 */
function pick(list, rng) {
  if (!Array.isArray(list) || list.length === 0) return "";
  return list[Math.floor(rng() * list.length)] ?? list[0];
}

/**
 * 取某个 key 的生效模板：自定义非空则覆盖默认，否则回默认。
 * @param {"activity"|"emotion"} kind
 * @param {string} key
 * @param {object} [custom] 来自 memory/templates.json
 * @returns {string[]}
 */
export function linesFor(kind, key, custom) {
  const defaults = kind === "activity" ? DEFAULT_ACTIVITY_LINES : DEFAULT_EMOTION_LINES;
  const own = custom?.[kind]?.[key];
  if (Array.isArray(own) && own.length) return own;
  return defaults[key] || [];
}

/**
 * 生成一句可直接发送的话。
 * @param {object} pulse 心跳（activity / needs）
 * @param {object} mood 心情（emotion / intensity）
 * @param {{rng?: Function, templates?: object}} [options] templates = {activity:{}, emotion:{}}
 * @returns {string}
 */
export function composeLine(pulse, mood, options = {}) {
  const rng = typeof options.rng === "function" ? options.rng : Math.random;
  const custom = options.templates || {};
  const activityId = pulse?.activity?.id;
  const emotion = String(mood?.emotion || "平静");
  const intensity = Number(mood?.intensity ?? 0.3);

  const activityLine = pick(linesFor("activity", activityId, custom), rng);
  // 心情强的时候，让情绪句占主导；不然以「在做什么」为主
  const emotionLine = intensity >= 0.45 ? pick(linesFor("emotion", emotion, custom), rng) : "";
  const parts = [activityLine, emotionLine].filter(Boolean);
  if (!parts.length) return "没什么事，就是想跟你说句话。";
  return parts.slice(0, 2).join("");
}

/** 给 agent 路径用的语气提示：别让它写成汇报。 */
export function styleHint(line) {
  return line ? `（想说的话大概是「${line}」，但你可以用自己的话说，不要复述。）` : "";
}
