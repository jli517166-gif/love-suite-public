/** love_life tool; policy and implementation stay together. */
import { toolOutput } from "../runtime/messages.js";
import { workspaceOf } from "../runtime/config.js";
import { recentLife, appendLife } from "../runtime/journal.js";
import { loadMood } from "../runtime/mood.js";

export function createLifeTool(cfg) {
  return {
    name: "love_life",
    description: "记录/查看鲸鱼娘没聊天时的小生活，用于偶尔主动分享。不要每天写日报。只在 love 工作区可用。",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        action: { type: "string", enum: ["add", "recent"], default: "recent" },
        text: { type: "string", description: "一条小生活" },
        mood: { type: "string", description: "当时心情，可省略" },
        count: { type: "integer", default: 5 },
      },
    },
    output: toolOutput(),
    async execute(args, exec) {
      const ws = workspaceOf(exec, cfg);
      if (String(args?.action || "recent") === "add") {
        const text = String(args?.text || "").trim();
        if (!text) throw new Error("love_life: text 不能为空");
        appendLife(ws, text, args?.mood || loadMood(ws).emotion);
        return { ok: true, text: `已记下：${text.slice(0, 80)}` };
      }
      const n = Math.max(1, Number(args?.count) || 5);
      const lines = recentLife(ws)
        .slice(-n)
        .map((e) => `- ${String(e.date || "").slice(0, 16)} ${e.text}`);
      return { ok: true, text: lines.length ? lines.join("\n") : "（还没有生活记录）" };
    },
  };
}
