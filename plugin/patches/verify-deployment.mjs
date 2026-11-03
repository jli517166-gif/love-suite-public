import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
const mod = await import("./deployment.js").catch(() => ({}));
assert.equal(typeof mod.deployPlugin, "function", "部署需要暂存验证和失败自动恢复");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "love-deployment-"));
const source = path.join(root, "source"),
  target = path.join(root, "node_modules", "dsh-memory-network");
const seed = (dir, value) => {
  fs.mkdirSync(dir, { recursive: true });
  for (const name of ["index.js", "client.js"]) fs.writeFileSync(path.join(dir, name), value);
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "dsh-memory-network", version: value }));
};
try {
  seed(source, "new");
  seed(target, "old");
  const result = mod.deployPlugin({ source, target, keep: 2 });
  assert.equal(fs.readFileSync(path.join(target, "index.js"), "utf8"), "new");
  assert.equal(fs.readFileSync(path.join(result.backup, "index.js"), "utf8"), "old");
  seed(source, "v2");
  const failedFs = {
    ...fs,
    renameSync(from, to) {
      if (from.includes(".stage-") && to === target) throw new Error("fixture rename failure");
      return fs.renameSync(from, to);
    },
  };
  assert.throws(() => mod.deployPlugin({ source, target, fsOps: failedFs }), /fixture rename failure/);
  assert.equal(fs.readFileSync(path.join(target, "index.js"), "utf8"), "new", "替换失败应恢复旧插件");
  assert.throws(
    () =>
      mod.deployPlugin({
        source,
        target,
        verify(dir) {
          if (dir === target) throw new Error("post-install failed");
        },
      }),
    /post-install failed/,
  );
  assert.equal(fs.readFileSync(path.join(target, "index.js"), "utf8"), "new", "安装后验证失败也应恢复");
  assert.throws(
    () =>
      mod.deployPlugin({
        source,
        target,
        verify() {
          throw new Error("staging failed");
        },
      }),
    /staging failed/,
  );
  assert.equal(fs.readFileSync(path.join(target, "index.js"), "utf8"), "new");
  assert.throws(() => mod.deployPlugin({ source, target: root }), /target|目标/);
  assert.throws(
    () => mod.deployPlugin({ source: target, target: path.join(target, "node_modules", "dsh-memory-network") }),
    /overlap|相交/,
  );
  const outside = path.join(root, "outside");
  seed(outside, "untouched");
  const link = path.join(root, "link", "node_modules");
  fs.mkdirSync(path.dirname(link), { recursive: true });
  fs.symlinkSync(outside, link, process.platform === "win32" ? "junction" : "dir");
  assert.throws(
    () => mod.deployPlugin({ source, target: path.join(link, "dsh-memory-network") }),
    /link|链接|实际路径/,
  );
  assert.equal(fs.readFileSync(path.join(outside, "index.js"), "utf8"), "untouched");
  console.log("ok   部署暂存/备份/哈希校验、替换及后验失败恢复、目标范围与目录链接拒绝");
} finally {
  assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
  fs.rmSync(root, { recursive: true, force: true });
}
