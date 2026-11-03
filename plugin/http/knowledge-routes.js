/** knowledge HTTP routes. Return true only after handling the request. */
import { readLearning, learnSkill } from "../runtime/learning.js";
import { sendJson, readRequestBody } from "./transport.js";
import { readStickers, collectSticker } from "../runtime/stickers.js";
import { templateSnapshot, addTemplate, updateTemplate, removeTemplate } from "../templates.js";
import { readPersona, readPersonaCatalog, writePersona, deletePersona, installPersona } from "../persona.js";

export async function handleKnowledgeRoutes(req, res, { url, route, eff, ws, baseCfg, ip }) {
  if (req.method === "GET" && route === "/learning") {
    const items = readLearning(ws).items.slice().reverse();
    sendJson(res, { ok: true, count: items.length, items });
    return true;
  }

  if (req.method === "POST" && route === "/learning") {
    const body = await readRequestBody(req);
    const entry = learnSkill(ws, { name: body?.name, note: body?.note, source: body?.source || "user" });
    const items = readLearning(ws).items.slice().reverse();
    sendJson(res, { ok: true, entry, count: items.length, items });
    return true;
  }

  if (req.method === "GET" && route === "/stickers") {
    const items = readStickers(ws).items.slice().reverse();
    sendJson(res, { ok: true, count: items.length, items });
    return true;
  }

  if (req.method === "POST" && route === "/stickers") {
    const body = await readRequestBody(req);
    const entry = collectSticker(ws, body?.path);
    if (!entry) throw new Error("收不下这张图（路径不存在 / 格式不支持 / 太小或太大）");
    const items = readStickers(ws).items.slice().reverse();
    sendJson(res, { ok: true, entry, count: items.length, items });
    return true;
  }

  if (req.method === "GET" && route === "/templates") {
    sendJson(res, { ok: true, ...templateSnapshot(ws) });
    return true;
  }

  if (req.method === "POST" && route === "/templates") {
    const body = await readRequestBody(req);
    const op = String(body?.op || "");
    const kind = String(body?.kind || "");
    const key = String(body?.key || "");
    let snapshot;
    if (op === "add") snapshot = addTemplate(ws, kind, key, body?.text);
    else if (op === "update") snapshot = updateTemplate(ws, kind, key, body?.index, body?.text);
    else if (op === "remove") snapshot = removeTemplate(ws, kind, key, body?.index);
    else throw new Error(`未知模板操作：${op || "(空)"}`);
    sendJson(res, { ok: true, ...snapshot });
    return true;
  }

  if (req.method === "GET" && route === "/persona") {
    sendJson(res, { ok: true, current: readPersona(ws), items: readPersonaCatalog(ws) });
    return true;
  }

  if (req.method === "POST" && route === "/persona") {
    const body = await readRequestBody(req);
    const hit = writePersona(ws, String(body?.key || ""));
    sendJson(res, { ok: true, current: hit.key, name: hit.name, items: readPersonaCatalog(ws) });
    return true;
  }

  if (req.method === "POST" && route === "/persona/delete") {
    const body = await readRequestBody(req);
    const result = deletePersona(ws, body?.key);
    sendJson(res, { ok: true, ...result });
    return true;
  }

  if (req.method === "POST" && route === "/persona/install") {
    const body = await readRequestBody(req);
    const result = installPersona(ws, body || {});
    sendJson(res, { ok: true, ...result, current: readPersona(ws), items: readPersonaCatalog(ws) });
    return true;
  }
  return false;
}
