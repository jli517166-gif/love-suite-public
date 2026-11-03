import { createReflectionTool } from "./reflection.js";
import { createCoreMemoryTool } from "./core_memory.js";
import { createGroupTool } from "./group.js";
import { createRecallTool } from "./recall.js";
import { createMoodTool } from "./mood.js";
import { createLifeTool } from "./life.js";
import { createRecordTool } from "./record.js";
import { createEmojiTool } from "./emoji.js";
import { createDoctorTool } from "./doctor.js";
import { createSelfTool } from "./self.js";
import { createStickerTool } from "./sticker.js";
import { createLearnTool } from "./learn.js";
import { createDistillTool } from "./distill.js";
import { createTemplateTool } from "./template.js";
import { createProactiveTool } from "./proactive.js";

/** Keep registration order stable for host/tool compatibility. */
export function makeTools(cfg) {
  return [
    createReflectionTool(cfg),
    createCoreMemoryTool(cfg),
    createGroupTool(cfg),
    createRecallTool(cfg),
    createMoodTool(cfg),
    createLifeTool(cfg),
    createRecordTool(cfg),
    createEmojiTool(cfg),
    createDoctorTool(cfg),
    createSelfTool(cfg),
    createStickerTool(cfg),
    createLearnTool(cfg),
    createDistillTool(cfg),
    createTemplateTool(cfg),
    createProactiveTool(cfg),
  ];
}
