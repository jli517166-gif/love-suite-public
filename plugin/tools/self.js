/** love_self tool; policy and implementation stay together. */
import { toolOutput } from "../runtime/messages.js";
import { workspaceOf } from "../runtime/config.js";
import { ensureSelf, writeSelf } from "../runtime/self.js";

export function createSelfTool(cfg) {
  return {
    name: "love_self",
    description:
      "读/写她的自我叙事（memory/self.md）：get 读全文，write 重写手写部分（「现在」由插件自动刷新）。只在 love 工作区可用。",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        action: { type: "string", enum: ["get", "write", "refresh"], default: "get" },
        text: { type: "string", description: "write 用：新的自我叙事" },
      },
    },
    output: toolOutput(),
    async execute(args, exec) {
      const workspace = workspaceOf(exec, cfg);
      const action = String(args?.action || "get");
      if (action === "write") {
        const narrative = String(args?.text || "").trim();
        if (!narrative) throw new Error("love_self: write 需要 text");
        const written = writeSelf(workspace, narrative);
        return { ok: true, text: `已更新自我叙事（${written.length} 字）` };
      }
      return { ok: true, text: ensureSelf(workspace) };
    },
  };
}
