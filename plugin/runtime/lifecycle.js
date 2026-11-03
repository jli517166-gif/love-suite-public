/** runtime/lifecycle — extracted behavior; dependencies are explicit ESM imports. */
import fs from "node:fs";
import path from "node:path";
import { lovePaths, writeJson, defaults, moodDefault } from "./storage.js";

export function resetWorkspace(workspace, now = new Date()) {
  const p = lovePaths(workspace);
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  const stamp = local.toISOString().replace(/[-:]/g, "").slice(0, 15).replace("T", "-");
  const backupRoot = path.join(p.root, ".reset-backups", stamp);
  fs.mkdirSync(backupRoot, { recursive: true });
  if (fs.existsSync(p.mem)) {
    fs.cpSync(p.mem, path.join(backupRoot, "memory"), { recursive: true });
  }

  fs.rmSync(p.mem, { recursive: true, force: true });
  fs.mkdirSync(p.journal, { recursive: true });
  writeJson(p.profile, defaults(workspace).profile);
  writeJson(p.relationship, defaults(workspace).relationship);
  writeJson(p.mood, moodDefault());
  writeJson(p.state, defaults(workspace).state);
  // self.md / activity.jsonl / pulse.json / stickers / outbox / proactive.json
  // 删掉即回到默认：下次读会重新生成。
  return { workspace, backup: backupRoot };
}
