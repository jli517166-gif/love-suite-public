/** love_proactive tool; policy and implementation stay together. */
import { toolOutput } from "../runtime/messages.js";
import { workspaceOf, effectiveConfig } from "../runtime/config.js";
import { readProactive, readPulse } from "../runtime/pulse-store.js";
import { choosePrompt } from "../runtime/proactive.js";
import { outboxStats } from "../outbox.js";
import { createChannel } from "../channels/qq.js";

export function createProactiveTool(cfg) {
  return {
    name: "love_proactive",
    description: "查看主动聊天状态或生成一条 dry-run 提示；不会直接发送。只在 love 工作区可用。",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        action: { type: "string", enum: ["status", "dry_run"], default: "status" },
      },
    },
    output: toolOutput(),
    async execute(args, exec) {
      const ws = workspaceOf(exec, cfg);
      const action = String(args?.action || "status");
      const eff = effectiveConfig(cfg);
      const workspace = ws;
      const state = readProactive(workspace);
      if (action === "status") {
        const dates = Array.isArray(state.dates) ? state.dates : [];
        const outbox = outboxStats(workspace);
        const channel = createChannel(eff);
        const pulse = readPulse(workspace);
        const n = pulse.needs || {};
        return {
          ok: true,
          text:
            `主动聊天：${eff.proactiveEnabled ? "开启" : "关闭"}；上次 ${state.last_sent || "无"}；` +
            `随机窗口 ${state.next_at || "未抽"}；下次可发 ${state.next_after || "未定"}；记录 ${dates.length} 次\n` +
            `通道：${channel.describe()}；发件箱 ${outbox.fresh} 条待补发（共 ${outbox.total}）\n` +
            `心跳：${pulse.activity?.label || "未知"}｜依恋 ${Number(n.attachment ?? 0).toFixed(2)} / ` +
            `好奇 ${Number(n.curiosity ?? 0).toFixed(2)} / 精力 ${Number(n.energy ?? 0).toFixed(2)}`,
        };
      }
      const picked = choosePrompt(ws, state, false, cfg);
      return { ok: true, text: picked ? `[dry-run] ${picked.prompt}` : "当前没有合适的话题" };
    },
  };
}
