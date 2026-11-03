/** reflection HTTP routes. Return true only after handling the request. */
import { groupWorkspaceFor } from "../runtime/config.js";
import { sendJson, readRequestBody } from "./transport.js";
import {
  reflectionStatus,
  readReflectionMaterial,
  reflectionDetail,
  readReflection,
  listReflections,
  retryReflection,
  skipReflection,
} from "../reflection.js";
import { hostState } from "../runtime/host-state.js";
import { withWorkerWait } from "../reflection-guidance.js";
import { memorySessionReadOnly } from "../runtime/memory-policy.js";

export async function handleReflectionRoutes(req, res, { url, route, eff, ws, baseCfg, ip }) {
  if (req.method === "GET" && route === "/reflection") {
    const groupId = String(url.searchParams.get("groupId") || "");
    if (groupId && !/^[1-9][0-9]{4,11}$/.test(groupId)) throw new Error("群号不合法");
    const target = groupId ? groupWorkspaceFor(ws, groupId) : ws;
    const jobId = url.searchParams.get("jobId");
    const worker = hostState.reflectionWorkerRef?.describe(ws) || null;
    const decorate = (job) =>
      job
        ? {
            ...job,
            diagnosis: withWorkerWait(
              job.diagnosis,
              memorySessionReadOnly(eff, job.sessionId) ? { ...worker, phase: "read_only" } : worker,
            ),
          }
        : null;
    const listing = jobId
      ? null
      : listReflections(target, groupId, Number(url.searchParams.get("offset") || 0), {
          status: url.searchParams.get("status") || "active",
        });
    sendJson(res, {
      ok: true,
      groupId,
      status: reflectionStatus(target, groupId),
      worker,
      ...(jobId
        ? url.searchParams.get("material") === "1"
          ? {
              page: readReflectionMaterial(
                target,
                { jobId, offset: Number(url.searchParams.get("offset") || 0) },
                { groupId, plain: true },
              ),
            }
          : { job: decorate(reflectionDetail(readReflection(target, groupId, jobId))) }
        : { ...listing, jobs: listing.jobs.map(decorate) }),
    });
    return true;
  }

  if (req.method === "POST" && route === "/reflection") {
    const body = await readRequestBody(req),
      groupId = String(body.groupId || "");
    if (groupId && !/^[1-9][0-9]{4,11}$/.test(groupId)) throw new Error("群号不合法");
    if (!Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0)
      throw new Error("需要当前整理队列版本，请刷新");
    if (!["retry", "skip"].includes(body.action)) throw new Error("管理操作仅支持retry或skip");
    const target = groupId ? groupWorkspaceFor(ws, groupId) : ws;
    const result =
      body.action === "retry" ? retryReflection(target, body, { groupId }) : skipReflection(target, body, { groupId });
    sendJson(res, { ok: true, groupId, result, status: reflectionStatus(target, groupId) });
    return true;
  }
  return false;
}
