import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
assert.ok(fs.existsSync(new URL("../client-src/index.js", import.meta.url)), "面板需要可维护模块源码");
const result = spawnSync(process.execPath, ["scripts/build-client.mjs", "--check"], { encoding: "utf8" });
assert.equal(result.status, 0, result.stdout + result.stderr);
assert.ok(
  !fs.readFileSync(new URL("../client-src/panel.js", import.meta.url), "utf8").includes("const CSS ="),
  "样式与组件职责分离",
);
assert.ok(
  !fs.readFileSync(new URL("../client-src/panel.js", import.meta.url), "utf8").includes("useState("),
  "面板渲染与状态/副作用所有权分离",
);
console.log("ok   可复现面板构建、宿主单文件产物一致");
