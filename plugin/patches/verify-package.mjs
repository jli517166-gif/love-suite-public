#!/usr/bin/env node
/**
 * 包装完整性检查：防止「package.json 带 BOM / 坏 JSON」这类一坏就整包不可用的事故。
 *
 *   node patches/verify-package.mjs
 *
 * 检查：
 *   1) package.json 能 JSON.parse（BOM 会在这里炸）
 *   2) 关键字段齐全：name/version/type/main/dsh.bundle.patch
 *   3) main 指向的文件存在，cordis.patch.yml 存在且非空
 *   4) 每个模块都能被 import（语法 + 依赖解析）
 *   5) 手册 JSON 能解析、条数够
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = process.env.LOVE_PLUGIN_DIR || path.resolve(here, "..");
const asUrl = (p) => `file:///${p.replace(/\\/g, "/")}`;

const results = [];
let failed = 0;
async function check(name, fn) {
  try {
    await fn();
    results.push(`ok   ${name}`);
  } catch (error) {
    results.push(`FAIL ${name}: ${error?.message ?? error}`);
    failed += 1;
  }
}

const pkgPath = path.join(dir, "package.json");

await check("package.json 是合法 JSON（没有 BOM）", () => {
  const bytes = fs.readFileSync(pkgPath);
  if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    throw new Error("文件开头有 UTF-8 BOM，JSON.parse 会报 Unexpected token");
  }
  JSON.parse(fs.readFileSync(pkgPath, "utf8"));
});

await check("package.json 关键字段齐全", () => {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  for (const key of ["name", "version", "type", "main"]) {
    if (!pkg[key]) throw new Error(`缺字段 ${key}`);
  }
  if (pkg.type !== "module") throw new Error("type 必须是 module");
  if (!pkg.dsh?.bundle?.patch) throw new Error("缺 dsh.bundle.patch");
  if (!pkg.files?.includes("index.js") && !pkg.files?.includes("*.js")) throw new Error("files 里缺 index.js");
});

await check("入口与 bundle patch 文件存在", () => {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  const main = path.join(dir, pkg.main);
  if (!fs.existsSync(main)) throw new Error(`main 不存在：${pkg.main}`);
  const patch = path.join(dir, pkg.dsh.bundle.patch);
  if (!fs.existsSync(patch)) throw new Error(`bundle patch 不存在：${pkg.dsh.bundle.patch}`);
  if (fs.readFileSync(patch, "utf8").trim().length === 0) throw new Error("cordis.patch.yml 是空的");
});

const peerCandidates = ["../node_modules/@deepseek-ai/schemastery", "../../node_modules/@deepseek-ai/schemastery"]
  .map((rel) => path.resolve(dir, rel));
const hasPeer = peerCandidates.some((p) => fs.existsSync(p));
if (hasPeer) {
  await check("所有模块都能 import", async () => {
    const modules = ["index.js", "emoji.js", "pulse.js", "outbox.js", "appraisal.js", "channels/qq.js", "channels/web.js"];
    for (const rel of modules) {
      const file = path.join(dir, rel);
      if (!fs.existsSync(file)) throw new Error(`缺文件 ${rel}`);
      await import(asUrl(file));
    }
  });
} else {
  results.push("skip 所有模块都能 import（@deepseek-ai/schemastery 未安装）");
}

await check("表情手册能解析、条数够", () => {
  const table = JSON.parse(fs.readFileSync(path.join(dir, "emoji", "qq-faces.json"), "utf8"));
  const count = Object.keys(table.faces || {}).length;
  if (count < 300) throw new Error(`手册只有 ${count} 条`);
});

console.log(results.join("\n"));
if (failed) {
  console.log(`\n${failed} 项没通过 —— 包本身有问题，插件可能整包加载失败。`);
  process.exitCode = 1;
}
