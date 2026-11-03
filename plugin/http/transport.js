/** http/transport — extracted behavior; dependencies are explicit ESM imports. */

export function sendJson(res, data, status = 200, extraHeaders = {}) {
  const body = Buffer.from(JSON.stringify(data), "utf8");
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": body.length,
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
  res.end(body);
}

export function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
      try {
        req.destroy();
      } catch {}
    };
    req.on("data", (chunk) => {
      if (settled) return;
      body += chunk;
      if (body.length > 1_000_000) fail(new Error("body too large"));
    });
    req.on("end", () => {
      if (settled) return;
      settled = true;
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", (error) => fail(error));
  });
}

export function isTrustedMutation(req) {
  const origin = String(req?.headers?.origin || "");
  if (!origin) return true;
  try {
    const url = new URL(origin);
    const host = String(req?.headers?.host || "");
    const local = ["127.0.0.1", "localhost", "[::1]", "::1"].includes(url.hostname);
    return local && url.host === host;
  } catch {
    return false;
  }
}
