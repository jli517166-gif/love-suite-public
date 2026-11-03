/**
 * 心跳（pulse）：她一个人时也在变化的那部分。
 *
 * 这里全是纯函数，不读文件、不调模型。插件每分钟 tick 一次，把结果写进
 * `memory/pulse.json`：她在做什么、有多想说话、有多少好奇、还有多少精力。
 *
 * 这些数字不直接决定"发不发消息"（那还是 scheduler 的活），但它们会：
 *   - 影响主动聊天的话题（"你刚才在窝着看书"）
 *   - 影响当天跳过概率（越是想你越不容易跳过）
 *   - 给 AIRI 一个"现在在做什么"的状态
 */

/** 独处时的活动池：按小时过滤，权重越大越常出现。 */
export const ACTIVITIES = [
  { id: "sleeping", label: "睡着了", hours: [0, 7], weight: 12 },
  { id: "daydream", label: "发呆", hours: [0, 24], weight: 3 },
  { id: "reading", label: "窝着看书", hours: [8, 23], weight: 4 },
  { id: "tidying", label: "整理小本子", hours: [9, 22], weight: 3 },
  { id: "music", label: "听着歌", hours: [9, 24], weight: 3 },
  { id: "window", label: "趴窗边看外面", hours: [7, 19], weight: 3 },
  { id: "writing", label: "写点东西", hours: [10, 23], weight: 2 },
  { id: "snack", label: "找点吃的", hours: [7, 21], weight: 2 },
  { id: "tidy-room", label: "收拾屋子", hours: [9, 20], weight: 1 },
];

const clamp01 = (n) => Math.max(0, Math.min(1, n));

/** 精力随一天走：凌晨最低，上午和傍晚最高。 */
export function energyAt(now) {
  const hour = new Date(now).getHours();
  if (hour < 6) return 0.12;
  if (hour < 9) return 0.45;
  if (hour < 12) return 0.9;
  if (hour < 14) return 0.7;
  if (hour < 18) return 0.85;
  if (hour < 22) return 0.6;
  return 0.3;
}

function localIso(now) {
  const d = new Date(now);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 19);
}

/** 按当前小时挑一个活动；rng 可注入，方便测试。 */
export function pickActivity(now, rng = Math.random) {
  const hour = new Date(now).getHours();
  const pool = ACTIVITIES.filter((a) => hour >= a.hours[0] && hour < a.hours[1]);
  const list = pool.length ? pool : ACTIVITIES.filter((a) => a.id === "daydream");
  const total = list.reduce((sum, a) => sum + a.weight, 0);
  let roll = rng() * total;
  let picked = list[list.length - 1];
  for (const item of list) {
    roll -= item.weight;
    if (roll <= 0) {
      picked = item;
      break;
    }
  }
  const minutes = 30 + Math.floor(rng() * 60); // 30–90 分钟换一次
  return {
    id: picked.id,
    label: picked.label,
    since: localIso(now),
    until: localIso(now + minutes * 60000),
  };
}

/** 新建一份心跳（第一次跑、或文件坏了）。 */
export function defaultPulse(now = Date.now(), rng = Math.random) {
  return {
    updated: localIso(now),
    activity: pickActivity(now, rng),
    needs: { attachment: 0.3, curiosity: 0.5, energy: energyAt(now) },
  };
}

/** 想说几句话的冲动：依恋/好奇取大者，再被精力缩放。 */
export function impulseOf(needs) {
  const drive = Math.max(Number(needs?.attachment ?? 0), Number(needs?.curiosity ?? 0));
  const energy = Number(needs?.energy ?? 0.5);
  return clamp01(drive * (0.5 + 0.5 * energy));
}

/**
 * 推进一次心跳（纯函数）。
 * @param {object} pulse 上一次的心跳
 * @param {number} now 当前时间戳
 * @param {number} minutesSinceContact 距离上次真实互动多少分钟（Infinity = 从没聊过）
 * @param {Function} rng 随机源（测试注入）
 */
export function tick(pulse, now = Date.now(), minutesSinceContact = Number.POSITIVE_INFINITY, rng = Math.random) {
  const base = pulse && pulse.needs ? pulse : defaultPulse(now, rng);
  const last = Date.parse(String(base.updated || ""));
  const minutes = Number.isFinite(last) ? Math.max(0, (now - last) / 60000) : 1;

  const needs = { ...base.needs };
  // 越久没说话越想；刚聊完长得慢（不会立刻又黏上来）
  const attachmentRate = minutesSinceContact < 120 ? 0.0015 : 0.004;
  needs.attachment = clamp01(Number(needs.attachment ?? 0.3) + minutes * attachmentRate);
  needs.curiosity = clamp01(Number(needs.curiosity ?? 0.5) + minutes * 0.002);
  needs.energy = energyAt(now);

  let activity = base.activity;
  const until = activity ? Date.parse(String(activity.until || "")) : NaN;
  if (!activity || !Number.isFinite(until) || now >= until) {
    activity = pickActivity(now, rng);
  }

  return {
    updated: localIso(now),
    activity,
    needs: {
      attachment: Number(needs.attachment.toFixed(3)),
      curiosity: Number(needs.curiosity.toFixed(3)),
      energy: Number(needs.energy.toFixed(3)),
    },
  };
}

/** 真的聊上了：依恋回落一截，但不归零。 */
export function onInteraction(pulse, now = Date.now()) {
  const base = pulse && pulse.needs ? pulse : defaultPulse(now);
  return {
    ...base,
    updated: localIso(now),
    needs: {
      ...base.needs,
      attachment: Number(clamp01(Number(base.needs.attachment ?? 0.3) * 0.55).toFixed(3)),
    },
  };
}

/** 给主动聊天用的一句话："你刚才在窝着看书"。 */
export function activityPhrase(pulse) {
  const label = pulse?.activity?.label;
  return label ? `你刚才在${label}` : "";
}
