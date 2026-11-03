/** love_learn tool; policy and implementation stay together. */
import { toolOutput } from "../runtime/messages.js";
import { workspaceOf } from "../runtime/config.js";
import { readLearning, learnSkill } from "../runtime/learning.js";

export function createLearnTool(cfg) {
  return {
    name: "love_learn",
    description:
      "学习兼容入口：add（name/note/source）、list、search。列表包含当前核心能力，已迁移同名旧记录禁止覆盖，改用 love_core_memory 补来源或取代。新能力优先由你选择核心并记录。只在 love 工作区可用。",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        action: { type: "string", enum: ["add", "list", "search"], default: "list" },
        name: { type: "string", description: "能力名，例如「用语音回消息」" },
        note: { type: "string", description: "怎么用/学到什么" },
        source: { type: "string", description: "从哪学的：user / self / qq" },
        query: { type: "string", description: "search 用" },
      },
    },
    output: toolOutput(),
    async execute(args, exec) {
      const workspace = workspaceOf(exec, cfg);
      const action = String(args?.action || "list");
      if (action === "add") {
        const entry = learnSkill(workspace, { name: args?.name, note: args?.note, source: args?.source });
        return { ok: true, text: `记下了：${entry.name}（第 ${entry.times} 次）` };
      }
      const items = readLearning(workspace).items.slice().reverse();
      const query = String(args?.query || "")
        .trim()
        .toLowerCase();
      const matched =
        action === "search" && query
          ? items.filter((item) => `${item.name} ${item.note || ""}`.toLowerCase().includes(query))
          : items;
      if (!matched.length) {
        return { ok: true, text: action === "search" ? `还没学会和「${query}」有关的` : "还没有学习记录" };
      }
      return {
        ok: true,
        text: matched
          .slice(0, 30)
          .map((item) => `- ${item.name}｜${item.note || "—"}｜${item.date}｜${item.times || 1} 次`)
          .join("\n"),
      };
    },
  };
}
