/** graph HTTP routes. Return true only after handling the request. */
import { currentStarUrl, openInBrowser } from "./star.js";
import { sendJson } from "./transport.js";
import { recomputeMood } from "../runtime/mood.js";
import { readPulse } from "../runtime/pulse-store.js";
import { avatarSuggestion } from "../live2d.js";
import { buildAllGraph, buildGroupGraph, buildGraph, graphStatus } from "../graph.js";
import { groupWorkspaceFor } from "../runtime/config.js";

export async function handleGraphRoutes(req, res, { url, route, eff, ws, baseCfg, ip }) {
  if (req.method === "POST" && route === "/open-star") {
    const url = currentStarUrl();
    if (!url) throw new Error("Web 服务还没起来，拿不到星图地址");
    if (!openInBrowser(url)) throw new Error("无法调起系统浏览器");
    sendJson(res, { ok: true, url });
    return true;
  }

  if (req.method === "GET" && route === "/avatar") {
    const mood = recomputeMood(ws);
    const activity = readPulse(ws)?.activity?.label || "";
    sendJson(res, { ok: true, emotion: mood.emotion, activity, ...avatarSuggestion(mood.emotion, activity) });
    return true;
  }

  if (req.method === "GET" && route === "/graph") {
    const groupId = url.searchParams.get("groupId");
    const scope = url.searchParams.get("scope");
    sendJson(
      res,
      scope === "all"
        ? await buildAllGraph(ws)
        : groupId
          ? await buildGroupGraph(groupWorkspaceFor(ws, groupId), groupId)
          : await buildGraph(ws),
    );
    return true;
  }

  if (req.method === "GET" && route === "/graph/status") {
    sendJson(res, { ok: true, ...graphStatus(ws) });
    return true;
  }

  if (req.method === "GET" && route === "/graph/export") {
    const data = await buildGraph(ws);
    sendJson(res, {
      ok: true,
      out: `nodes=${data.stats.nodes} links=${data.stats.links} memories=${data.stats.memories}`,
      stats: data.stats,
      ...graphStatus(ws),
    });
    return true;
  }
  return false;
}
