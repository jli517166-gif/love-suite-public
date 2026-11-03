/**
 * Live2D 只读适配：读 dsh-plugin-live2d-stage 的目录，给当前心情推荐一个动作/表情。
 *
 * 第一阶段只做“建议”，不主动播放；等 /live2d-stage/play 的准入验证通过后再升级成推送。
 * 任何文件缺失/格式变化都静默返回 available:false，不影响插件本身。
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function live2dRoot() {
  return path.join(process.env.DSH_HOME || path.join(os.homedir(), ".dsh"), "live2d-stage");
}

/** 心情 → 关键词。动作/表情的名字可以被用户改，所以按关键词找，不硬编码 ID。 */
const MOOD_HINTS = {
  开心: { motion: ["IDLE", "举手", "打招呼"], expression: ["开心", "笑", "屑屑眼"] },
  兴奋: { motion: ["举手", "竖手指"], expression: ["兔牙", "圈圈眼", "开心"] },
  平静: { motion: ["IDLE"], expression: ["默认"] },
  害羞: { motion: ["IDLE", "前倾"], expression: ["脸红", "流冷汗"] },
  想念: { motion: ["前倾", "IDLE"], expression: ["圈圈眼"] },
  不安: { motion: ["IDLE"], expression: ["流冷汗"] },
  难过: { motion: ["IDLE"], expression: ["哭", "流冷汗"] },
  委屈: { motion: ["IDLE"], expression: ["哭"] },
  生气: { motion: ["竖手指"], expression: ["生气", "屑屑眼"] },
};

const ACTIVITY_HINTS = {
  看书: { motion: ["IDLE"], expression: [] },
  发呆: { motion: ["IDLE"], expression: [] },
  打招呼: { motion: ["举手"], expression: ["开心"] },
  被夸: { motion: ["IDLE"], expression: ["开心", "脸红"] },
};

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function matchByName(items, hints) {
  if (!Array.isArray(items)) return null;
  for (const hint of hints) {
    const hit = items.find((item) => String(item?.name || "").includes(hint));
    if (hit) return hit;
  }
  return null;
}

export function suggestLive2D(emotion, activity) {
  const mood = MOOD_HINTS[String(emotion || "")] || MOOD_HINTS.平静;
  const extra = ACTIVITY_HINTS[String(activity || "")] || null;
  return {
    motionHints: extra?.motion?.length ? [...extra.motion, ...mood.motion] : mood.motion,
    expressionHints: extra?.expression?.length ? [...extra.expression, ...mood.expression] : mood.expression,
  };
}

/**
 * @returns {{available: boolean, reason?: string, characterId?: string, characterName?: string,
 *   motion?: object|null, expression?: object|null, motionHints?: string[], expressionHints?: string[]}}
 */
export function avatarSuggestion(emotion, activity) {
  const root = live2dRoot();
  if (!fs.existsSync(root)) return { available: false, reason: "没有安装 Live2D 插件" };

  const characters = readJson(path.join(root, "characters.json"));
  const selected = characters?.selectedId
    ? (characters.characters || []).find((item) => item.id === characters.selectedId)
    : null;
  if (!selected) return { available: false, reason: "Live2D 还没有选角色" };

  const catalogDir = path.join(root, "catalogs", selected.id);
  const motions = readJson(path.join(catalogDir, "motions.json"));
  const expressions = readJson(path.join(catalogDir, "expressions.json"));
  if (!motions && !expressions) return { available: false, reason: "Live2D 动作目录还没生成" };

  const hints = suggestLive2D(emotion, activity);
  return {
    available: true,
    characterId: selected.id,
    characterName: selected.name,
    motion: matchByName(motions?.motions, hints.motionHints),
    expression: matchByName(expressions?.expressions, hints.expressionHints),
    motionHints: hints.motionHints,
    expressionHints: hints.expressionHints,
  };
}
