/** love_doctor tool; policy and implementation stay together. */
import { toolOutput } from "../runtime/messages.js";
import { workspaceOf } from "../runtime/config.js";
import { doctorReport } from "../runtime/doctor.js";

export function createDoctorTool(cfg) {
  return {
    name: "love_doctor",
    description:
      "一条命令体检：版本、记忆文件、关系/心情/心跳、发件箱、通道、QQ 表情补丁、主动调度与开关。只在 love 工作区可用。",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
    output: toolOutput(),
    async execute(_args, exec) {
      const workspace = workspaceOf(exec, cfg);
      return { ok: true, text: await doctorReport(workspace, cfg) };
    },
  };
}
