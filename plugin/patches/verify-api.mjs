/**
 * API 集成测试：不启动 DSH，直接起一个 http server 调 handleApi。
 *
 * 覆盖：/status、/group/note、/group/status、/group/clear、/graph。
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

process.env.LOVE_TEST_ISOLATED = "1";

const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "love-api-"));
fs.mkdirSync(path.join(workspace, "memory"), { recursive: true });

const { handleApi } = await import("../index.js");
const cfg = {
  workspace,
  workspaces: [],
  channel: "none",
  proactiveEnabled: false,
  groupIds: ["1124440175"],
  groupProactive: false,
  groupMemoryEnabled: true,
};

const server = http.createServer((req, res) => {
  handleApi(req, res, cfg).catch((error) => {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: String(error?.message || error) }));
  });
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}/love-companion/api`;

async function request(pathname, options = {}) {
  const response = await fetch(base + pathname, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}

let failed = 0;
async function check(name, fn) {
  try { await fn(); console.log("ok   " + name); }
  catch (error) { failed += 1; console.log("FAIL " + name + ": " + (error?.message || error)); }
}

await check("API：/status 可直接读", async () => {
  const { status, data } = await request("/status");
  assert.equal(status, 200);
  assert.equal(data.ok, true);
  assert.equal(data.workspace, workspace);
});

await check("API：写群笔记", async () => {
  const { status } = await request("/group/note", {
    method: "POST",
    body: JSON.stringify({ groupId: "1124440175", text: "API 测试笔记" }),
  });
  assert.equal(status, 200);
});

await check("API：群状态包含笔记", async () => {
  const { status, data } = await request("/group/status?groupId=1124440175");
  assert.equal(status, 200);
  assert.ok((data.notes || []).some((note) => String(note.text || "").includes("API 测试笔记")));
});

await check("API：清除群档案需要正确确认", async () => {
  const wrong = await request("/group/clear", {
    method: "POST",
    body: JSON.stringify({ groupId: "1124440175", confirm: "wrong" }),
  });
  assert.equal(wrong.status, 400);
  const right = await request("/group/clear", {
    method: "POST",
    body: JSON.stringify({ groupId: "1124440175", confirm: "1124440175" }),
  });
  assert.equal(right.status, 200);
});

await check("API：/graph 返回节点", async () => {
  const { status, data } = await request("/graph");
  assert.equal(status, 200);
  assert.ok(Array.isArray(data.nodes));
});

server.close();
fs.rmSync(workspace, { recursive: true, force: true });
if (failed) {
  console.log("\n" + failed + " 项没过");
  process.exit(1);
}
console.log("\n全部通过。");
