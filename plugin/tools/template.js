/** love_template tool; policy and implementation stay together. */
import { toolOutput } from "../runtime/messages.js";
import { workspaceOf } from "../runtime/config.js";
import { templateSnapshot, addTemplate, updateTemplate, removeTemplate } from "../templates.js";

export function createTemplateTool(cfg) {
  return {
    name: "love_template",
    description:
      "管理模板直出的语句：list / add / update / remove。activity 是按她在做什么，emotion 是按心情。只在 love 工作区可用。",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        action: { type: "string", enum: ["list", "add", "update", "remove"], default: "list" },
        kind: { type: "string", enum: ["activity", "emotion"] },
        key: { type: "string", description: "activity 用 activity id，emotion 用心情名" },
        text: { type: "string", description: "add/update 的内容" },
        index: { type: "integer", description: "update/remove 的序号（从 0 开始）" },
      },
    },
    output: toolOutput(),
    async execute(args, exec) {
      const workspace = workspaceOf(exec, cfg);
      const action = String(args?.action || "list");
      const kind = String(args?.kind || "");
      const key = String(args?.key || "");
      if (action === "add") {
        addTemplate(workspace, kind, key, args?.text);
        return { ok: true, text: `已添加：${kind}/${key}` };
      }
      if (action === "update") {
        updateTemplate(workspace, kind, key, args?.index, args?.text);
        return { ok: true, text: `已更新：${kind}/${key} #${args?.index}` };
      }
      if (action === "remove") {
        removeTemplate(workspace, kind, key, args?.index);
        return { ok: true, text: `已删除：${kind}/${key} #${args?.index}` };
      }
      const snapshot = templateSnapshot(workspace);
      const lines = [];
      for (const group of ["activity", "emotion"]) {
        lines.push(group === "activity" ? "活动：" : "心情：");
        for (const [name, items] of Object.entries(snapshot.effective[group])) {
          lines.push(`- ${name}（${items.length} 条）`);
          for (const item of items) lines.push(`  · ${item}`);
        }
      }
      return { ok: true, text: lines.join("\n") };
    },
  };
}
