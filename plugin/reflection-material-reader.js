/** Bounded sequential archive read, using exactly the same lease/read receipt as foreground tools. */
import { readReflectionMaterial } from "./reflection.js";
import { coreBatchDigest } from "./core-memory.js";
const limit = () =>
  Object.assign(new Error("完整材料超过后台输入上限，需要分段或人工补读"), { code: "REFLECTION_INPUT_LIMIT" });
export function readWorkerMaterial(scope, lease, { now = Date.now, maxBytes = 24000, maxPages = 8 } = {}) {
  if (lease.job.complete) return { job: lease.job, readToken: undefined, metadata: { kind: "inline", pages: 0 } };
  let offset = 0,
    serialized = "",
    readToken,
    pages = 0,
    digest;
  do {
    const page = readReflectionMaterial(
      scope.workspace,
      { jobId: lease.job.id, leaseToken: lease.leaseToken, offset },
      { groupId: scope.groupId, track: true, now: now() },
    );
    if (!page.complete || page.totalChars > maxBytes || pages >= maxPages) throw limit();
    if (digest !== undefined && digest !== page.materialDigest) throw new Error("补读材料摘要变化");
    digest = page.materialDigest;
    serialized += page.text;
    pages++;
    if (Buffer.byteLength(serialized, "utf8") > maxBytes) throw limit();
    offset = page.nextOffset;
    readToken = page.readToken;
  } while (offset !== null);
  const data = JSON.parse(serialized);
  if (!readToken || !Array.isArray(data.materials) || coreBatchDigest(data.materials) !== digest)
    throw new Error("完整补读凭据或材料摘要不符");
  return {
    job: { ...lease.job, complete: true, materials: data.materials },
    readToken,
    metadata: { kind: "full-archive", pages, bytes: Buffer.byteLength(serialized, "utf8") },
  };
}
