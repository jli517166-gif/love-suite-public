/** runtime/pulse-store — extracted behavior; dependencies are explicit ESM imports. */
import path from "node:path";
import { lovePaths, readJson, writeJson } from "./storage.js";
import fs from "node:fs";
import { LEGACY_PROACTIVE_STATE } from "./environment.js";
import { defaultPulse, tick as tickPulse } from "../pulse.js";
import { logActivity } from "./activity.js";
import { minutesSinceContact } from "./contact.js";

export function proactivePath(workspace) {
  return path.join(lovePaths(workspace).mem, "proactive.json");
}

export function readProactive(workspace) {
  const file = proactivePath(workspace);
  const current = readJson(file, null);
  if (current && typeof current === "object") return current;
  const legacy = readJson(LEGACY_PROACTIVE_STATE, null);
  if (legacy && typeof legacy === "object") {
    writeJson(file, legacy);
    try {
      fs.renameSync(LEGACY_PROACTIVE_STATE, LEGACY_PROACTIVE_STATE + ".migrated");
    } catch {}
    return legacy;
  }
  return {};
}

export function writeProactive(workspace, state) {
  writeJson(proactivePath(workspace), state);
  return state;
}

export function readPulse(workspace) {
  const pulse = readJson(lovePaths(workspace).pulse, null);
  return pulse && pulse.needs ? pulse : defaultPulse();
}

export function writePulse(workspace, pulse) {
  writeJson(lovePaths(workspace).pulse, pulse);
  return pulse;
}

export function stepPulse(workspace, now = Date.now()) {
  const previous = readPulse(workspace);
  const next = tickPulse(previous, now, minutesSinceContact(workspace, now));
  try {
    logActivity(workspace, previous, next);
  } catch {}
  return writePulse(workspace, next);
}
