/** http/star — extracted behavior; dependencies are explicit ESM imports. */
import { hostState } from "../runtime/host-state.js";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export function currentStarUrl() {
  try {
    return starUrlFor(hostState.webServerRef?.protocol, hostState.webServerRef?.port) || hostState.starUrlAbs;
  } catch {
    return hostState.starUrlAbs;
  }
}

export const STAR_ROOT = fileURLToPath(new URL("../star/", import.meta.url));

export const STAR_FILES = {
  "": ["index.html", "text/html; charset=utf-8"],
  "index.html": ["index.html", "text/html; charset=utf-8"],
  "alt.html": ["alt.html", "text/html; charset=utf-8"],
  "vendor/3d-force-graph.min.js": ["vendor/3d-force-graph.min.js", "application/javascript; charset=utf-8"],
  "vendor/three.min.js": ["vendor/three.min.js", "application/javascript; charset=utf-8"],
  "assets/m83.jpg": ["assets/m83.jpg", "image/jpeg"],
};

export function starUrlFor(protocol, port) {
  const p = Number(port);
  if (!protocol || !Number.isFinite(p) || p <= 0) return "";
  return `${protocol}//127.0.0.1:${p}/love-companion/star/`;
}

export function openInBrowser(url) {
  const options = { detached: true, stdio: "ignore", windowsHide: true };
  try {
    if (process.platform === "win32") {
      spawn("cmd.exe", ["/c", "start", "", url], options).unref();
    } else if (process.platform === "darwin") {
      spawn("open", [url], options).unref();
    } else {
      spawn("xdg-open", [url], options).unref();
    }
    return true;
  } catch {
    return false;
  }
}

export function serveStar(req, res) {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  let rel = "";
  try {
    rel = decodeURIComponent(url.pathname.replace(/^\/love-companion\/star\/?/, ""));
  } catch {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("bad request");
    return;
  }
  const entry = STAR_FILES[rel];
  if (!entry) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("not found");
    return;
  }
  fs.readFile(path.join(STAR_ROOT, entry[0]), (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": entry[1],
      "Content-Length": data.length,
      "Cache-Control": "no-store",
    });
    res.end(data);
  });
}
