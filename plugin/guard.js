/**
 * 本机 API 的轻量防护：内存限流 + 审计日志。
 *
 * 只挡误用/脚本刷接口，不是完整鉴权；鉴权仍靠 apiToken。
 */

import fs from "node:fs";
import path from "node:path";

const buckets = new Map();

/** 固定窗口限流：默认 180 次/分钟/IP。 */
export function rateLimit(key, limit = 180, windowMs = 60_000, now = Date.now()) {
  const id = String(key || "local");
  let bucket = buckets.get(id);
  if (!bucket || now - bucket.start >= windowMs) {
    bucket = { start: now, count: 0 };
    buckets.set(id, bucket);
  }
  bucket.count += 1;
  // 简单的内存清理，避免长期运行无限增长
  if (buckets.size > 2000) {
    for (const [oldKey, value] of buckets) {
      if (now - value.start > windowMs) buckets.delete(oldKey);
    }
  }
  return {
    ok: bucket.count <= limit,
    remaining: Math.max(0, limit - bucket.count),
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.start + windowMs - now) / 1000)),
  };
}

/** 写一行审计；失败不影响主流程。 */
export function audit(workspace, entry) {
  try {
    const file = path.join(workspace, "memory", "audit.jsonl");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    try {
      if (fs.statSync(file).size > 1_000_000) {
        for (let index = 2; index >= 1; index -= 1) {
          const from = file + "." + index;
          const to = file + "." + (index + 1);
          if (fs.existsSync(from)) fs.renameSync(from, to);
        }
        fs.renameSync(file, file + ".1");
      }
    } catch {}
    fs.appendFileSync(file, JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n", "utf8");
  } catch {}
}
