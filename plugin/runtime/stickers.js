/** runtime/stickers — extracted behavior; dependencies are explicit ESM imports. */
import { lovePaths, readJson, writeJson, localIso } from "./storage.js";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

export const STICKER_EXTS = new Set([".gif", ".png", ".jpg", ".jpeg", ".webp"]);

export const STICKER_MAX = 200;

export function readStickers(workspace) {
  const data = readJson(lovePaths(workspace).stickers, null);
  return data && Array.isArray(data.items) ? data : { items: [] };
}

export function writeStickers(workspace, data) {
  writeJson(lovePaths(workspace).stickers, data);
  return data;
}

export function collectSticker(workspace, sourcePath, now = Date.now()) {
  const file = String(sourcePath || "").trim();
  if (!file) return null;
  const ext = path.extname(file).toLowerCase();
  if (!STICKER_EXTS.has(ext)) return null;
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    return null;
  }
  if (!stat.isFile() || stat.size < 1024 || stat.size > 5 * 1024 * 1024) return null;

  let buffer;
  try {
    buffer = fs.readFileSync(file);
  } catch {
    return null;
  }
  const hash = createHash("sha1").update(buffer).digest("hex");
  const store = readStickers(workspace);
  const exists = store.items.find((item) => item.hash === hash);
  if (exists) return exists;

  const dir = lovePaths(workspace).stickerDir;
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, hash + ext);
  if (!fs.existsSync(target)) fs.writeFileSync(target, buffer);

  const entry = {
    id: hash.slice(0, 12),
    hash,
    name: path.basename(file, ext),
    file: target,
    addedAt: localIso(now),
    source: "incoming",
  };
  store.items.push(entry);
  if (store.items.length > STICKER_MAX) store.items = store.items.slice(-STICKER_MAX);
  writeStickers(workspace, store);
  return entry;
}

export function collectStickersFromText(workspace, text) {
  const added = [];
  for (const match of String(text || "").matchAll(/\[表情包:([^\]]+)\]/g)) {
    try {
      const entry = collectSticker(workspace, match[1]);
      if (entry) added.push(entry);
    } catch {}
  }
  return added;
}
