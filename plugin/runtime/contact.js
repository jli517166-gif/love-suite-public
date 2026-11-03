/** runtime/contact — extracted behavior; dependencies are explicit ESM imports. */
import { lovePaths, readJson } from "./storage.js";

export function minutesSinceContact(workspace, now = Date.now()) {
  const state = readJson(lovePaths(workspace).state, {});
  const lastSeen = Date.parse(String(state.last_seen || ""));
  if (!Number.isFinite(lastSeen)) return Number.POSITIVE_INFINITY;
  return Math.max(0, (now - lastSeen) / 60000);
}
