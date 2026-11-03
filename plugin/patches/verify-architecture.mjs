import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "acorn";
import { analyze } from "eslint-scope";
import { spawnSync } from "node:child_process";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const attributes = spawnSync(
  "git",
  [
    "check-attr",
    "eol",
    "--",
    "plugin/index.js",
    "plugin/client-src/panel.js",
    "plugin/runtime/config.js",
    "plugin/http/api.js",
    "plugin/tools/index.js",
    "plugin/memory-contract.js",
  ],
  { cwd: path.dirname(root), encoding: "utf8" },
);
assert.equal(attributes.status, 0, attributes.stderr);
assert.ok(
  attributes.stdout
    .trim()
    .split(/\r?\n/)
    .every((line) => line.endsWith(": eol: lf")),
  "Windows冷检出必须保留受格式检查源码的LF，不依赖core.autocrlf",
);
assert.ok(fs.existsSync(path.join(root, "runtime/storage.js")), "服务端应按职责拆分，入口仅装配");
const visit = (dir) =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((item) =>
      item.isDirectory()
        ? visit(path.join(dir, item.name))
        : item.name.endsWith(".js")
          ? [path.join(dir, item.name)]
          : [],
    );
const files = [
  ...fs
    .readdirSync(root)
    .filter((n) => n.endsWith(".js") && n !== "client.js")
    .map((n) => path.join(root, n)),
  ...["runtime", "tools", "http", "client-src"].flatMap((n) => visit(path.join(root, n))),
];
const globals = new Set([
  "Array",
  "Object",
  "String",
  "Number",
  "Boolean",
  "Math",
  "JSON",
  "Date",
  "Map",
  "Set",
  "WeakMap",
  "WeakSet",
  "Promise",
  "Error",
  "TypeError",
  "RangeError",
  "SyntaxError",
  "RegExp",
  "URL",
  "URLSearchParams",
  "Buffer",
  "process",
  "console",
  "setTimeout",
  "clearTimeout",
  "setInterval",
  "clearInterval",
  "fetch",
  "AbortController",
  "AbortSignal",
  "Infinity",
  "NaN",
  "undefined",
  "structuredClone",
  "decodeURIComponent",
  "encodeURIComponent",
  "parseInt",
  "parseFloat",
  "isNaN",
  "Intl",
  "TextEncoder",
  "TextDecoder",
  "Symbol",
  "globalThis",
  "Uint8Array",
]);
const browserGlobals = [
  "window",
  "document",
  "navigator",
  "Blob",
  "FileReader",
  "ResizeObserver",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "HTMLElement",
  "Event",
];
const edges = new Map();
for (const file of files) {
  const text = fs.readFileSync(file, "utf8"),
    ast = parse(text, { ecmaVersion: 2025, sourceType: "module", ranges: true });
  const manager = analyze(ast, { ecmaVersion: 2024, sourceType: "module" });
  if (
    file.includes(path.sep + "client-src" + path.sep) ||
    ["runtime", "http", "tools"].some((dir) => file.includes(path.sep + dir + path.sep))
  ) {
    const unused = manager.scopes
      .find((scope) => scope.type === "module")
      .variables.filter((variable) => variable.defs[0]?.type === "ImportBinding" && !variable.references.length)
      .map((variable) => variable.name);
    assert.deepEqual(unused, [], path.relative(root, file) + "不能保留无用模块依赖");
  }
  const allowed = new Set([...globals, ...(file.includes(path.sep + "client-src" + path.sep) ? browserGlobals : [])]);
  const unknown = [
    ...new Set(manager.globalScope.through.map((ref) => ref.identifier.name).filter((n) => !allowed.has(n))),
  ];
  assert.deepEqual(unknown, [], path.relative(root, file) + "存在未声明依赖");
  const imports = ast.body
    .filter((n) => n.type === "ImportDeclaration" || (n.type === "ExportNamedDeclaration" && n.source))
    .map((n) => n.source.value)
    .filter((n) => n.startsWith("."))
    .map((n) => path.resolve(path.dirname(file), n));
  for (const target of imports) assert.ok(fs.existsSync(target), path.relative(root, file) + "缺模块" + target);
  edges.set(
    file,
    imports.filter((n) => n.endsWith(".js")),
  );
  assert.ok(!/\beval\s*\(/.test(text), "不允许用eval拆分模块");
  if (file !== path.join(root, "index.js"))
    assert.ok(!imports.includes(path.join(root, "index.js")), "业务模块不得反向依赖装配入口");
}
const active = new Set(),
  done = new Set();
function check(file, trail = []) {
  assert.ok(!active.has(file), "循环依赖:" + trail.join(" -> "));
  if (done.has(file) || !edges.has(file)) return;
  active.add(file);
  for (const dep of edges.get(file)) check(dep, [...trail, path.relative(root, file)]);
  active.delete(file);
  done.add(file);
}
for (const file of files) check(file);
process.env.LOVE_TEST_ISOLATED = "1";
const actual = await import("../index.js");
const expected = JSON.parse(fs.readFileSync(new URL("./fixtures/public-exports.json", import.meta.url), "utf8"));
assert.deepEqual(Object.keys(actual).sort(), expected, "公开命名导出须保持兼容");
assert.ok(
  fs.readFileSync(path.join(root, "index.js"), "utf8").split("\n").length < 650,
  "装配入口不能继续承载业务巨石",
);
console.log("ok   服务职责/公开导出/显式依赖/未定义引用/循环依赖/入口边界");
