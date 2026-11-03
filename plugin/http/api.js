import { isTrustedMutation, sendJson } from "./transport.js";
import { effectiveConfig } from "../runtime/config.js";
import { DEFAULT_LOVE } from "../runtime/environment.js";
import { rateLimit, audit } from "../guard.js";
import { handleCompanionRoutes } from "./companion-routes.js";
import { handleSettingsRoutes } from "./settings-routes.js";
import { handleGraphRoutes } from "./graph-routes.js";
import { handleKnowledgeRoutes } from "./knowledge-routes.js";
import { handleGroupsRoutes } from "./groups-routes.js";
import { handleReflectionRoutes } from "./reflection-routes.js";
export async function handleApi(req, res, baseCfg) {
  try {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const route = url.pathname.replace(/^\/love-companion\/api/, "") || "/";
    if (req.method === "POST" && !isTrustedMutation(req)) {
      sendJson(res, { ok: false, error: "跨站写操作被拒绝" }, 403);
      return;
    }

    const eff = effectiveConfig(baseCfg);
    const ws = eff.workspace || DEFAULT_LOVE;

    const ip = String(req.socket?.remoteAddress || "local");
    const limit = rateLimit(ip);
    if (!limit.ok) {
      audit(ws, { kind: "rate-limit", method: req.method, route, ip });
      sendJson(res, { ok: false, error: "请求太频繁，稍后再试" }, 429, {
        "Retry-After": String(limit.retryAfterSeconds),
      });
      return;
    }
    if (req.method === "POST") audit(ws, { kind: "mutation", route, ip });

    if (await handleCompanionRoutes(req, res, { url, route, eff, ws, baseCfg, ip })) return;
    if (await handleSettingsRoutes(req, res, { url, route, eff, ws, baseCfg, ip })) return;
    if (await handleGraphRoutes(req, res, { url, route, eff, ws, baseCfg, ip })) return;
    if (await handleKnowledgeRoutes(req, res, { url, route, eff, ws, baseCfg, ip })) return;
    if (await handleGroupsRoutes(req, res, { url, route, eff, ws, baseCfg, ip })) return;
    if (await handleReflectionRoutes(req, res, { url, route, eff, ws, baseCfg, ip })) return;

    sendJson(res, { ok: false, error: "not found" }, 404);
  } catch (err) {
    sendJson(res, { ok: false, error: String(err?.message ?? err) }, 400);
  }
}
