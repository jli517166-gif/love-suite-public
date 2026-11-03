/** love_mood tool; policy and implementation stay together. */
import { toolOutput } from "../runtime/messages.js";
import { workspaceOf, effectiveConfig } from "../runtime/config.js";
import { recomputeMood, moodLine, loadMood } from "../runtime/mood.js";
import { memorySessionReadOnly } from "../runtime/memory-policy.js";

export function createMoodTool(cfg) {
  return {
    name: "love_mood",
    description:
      "只读查看当前心情。心情由插件根据最近记忆、互动、沉默时间和随机因素自动生成，不能手动设置。只在 love 工作区可用。",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        action: { type: "string", enum: ["get", "refresh"], default: "get" },
      },
    },
    output: toolOutput(),
    async execute(args, exec) {
      const ws = workspaceOf(exec, cfg);
      const action = String(args?.action || "get");
      const session = exec?.agent?.session;
      const readOnly = memorySessionReadOnly(effectiveConfig(cfg), String(session?.id || session?.header?.id || ""));
      const mood = readOnly ? loadMood(ws) : recomputeMood(ws, action === "refresh");
      return { ok: true, text: moodLine(mood) };
    },
  };
}
