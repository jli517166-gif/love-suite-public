/** runtime/environment — extracted behavior; dependencies are explicit ESM imports. */
import path from "node:path";
import os from "node:os";

export const DEFAULT_LOVE = process.env.LOVE_WORKSPACE || path.join(os.homedir(), "love");

export const DEFAULT_INJECT = path.join(os.homedir(), ".dsh", "media", "onebot", "qq-inject.jsonl");

const LEGACY_NAPCAT_DIR = process.env.NAPCAT_DIR || path.join(os.homedir(), "NapCat");

export const LEGACY_PROACTIVE_STATE = path.join(LEGACY_NAPCAT_DIR, "proactive-state.json");

export const LEGACY_RUNTIME_CONFIG = path.join(LEGACY_NAPCAT_DIR, "love-companion.json");
