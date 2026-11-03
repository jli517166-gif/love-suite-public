/** love_distill tool; policy and implementation stay together. */
import { toolOutput } from "../runtime/messages.js";
import { workspaceOf } from "../runtime/config.js";
import { distillPersona } from "../runtime/self.js";

export function createDistillTool(cfg) {
  return {
    name: "love_distill",
    description:
      "把材料蒸馏成一个人格 skill（身份/口吻/在意/边界/口头禅），装进工作区并登记 persona.py；自我叙事为空时写种子。只在 love 工作区可用。",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        key: { type: "string", description: "人格 key，小写字母/数字/下划线" },
        name: { type: "string", description: "显示名" },
        description: { type: "string", description: "一句话描述（可选）" },
        identity: { type: "string", description: "她是谁、从哪来" },
        voice: { type: "string", description: "怎么说话" },
        values: { type: "string", description: "在意什么" },
        boundaries: { type: "string", description: "什么不接、不开的玩笑" },
        quotes: { type: "array", items: { type: "string" }, description: "口头禅/原话（可选）" },
        aliases: { type: "array", items: { type: "string" }, description: "中文别名（可选）" },
      },
      required: ["key", "name"],
    },
    output: toolOutput(),
    async execute(args, exec) {
      const workspace = workspaceOf(exec, cfg);
      const result = distillPersona(workspace, args || {});
      return {
        ok: true,
        text: `已蒸馏并安装：${result.name}（${result.skill}）\n在面板「设置 → 人格」里选中，或说「切换人格 ${result.name}」即可。记忆和原有能力不受影响。`,
      };
    },
  };
}
