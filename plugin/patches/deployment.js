/** Filesystem transaction for code installation only. Never touches workspace memories. */
import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
const inside = (parent, child) => {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith(".." + path.sep) && relative !== ".." && !path.isAbsolute(relative));
};
function noLinks(file, io) {
  let current = path.resolve(file);
  while (true) {
    if (io.existsSync(current) && io.lstatSync(current).isSymbolicLink())
      throw new Error("目标目录链接被拒绝：" + current);
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
}
export function validateDeploymentPaths(source, target, io = fs) {
  source = path.resolve(source);
  target = path.resolve(target);
  if (path.basename(target) !== "dsh-memory-network" || path.basename(path.dirname(target)) !== "node_modules")
    throw new Error("部署目标必须为 node_modules/dsh-memory-network");
  noLinks(source, io);
  noLinks(target, io);
  if (inside(source, target) || inside(target, source)) throw new Error("部署源与目标路径相交");
  for (const file of ["package.json", "index.js", "client.js"])
    if (!io.existsSync(path.join(source, file))) throw new Error("部署源文件缺失：" + file);
  if (JSON.parse(io.readFileSync(path.join(source, "package.json"), "utf8")).name !== "dsh-memory-network")
    throw new Error("部署源不是 dsh-memory-network");
  return { source, target, parent: path.dirname(target) };
}
export function treeHashes(dir, io = fs) {
  const result = {};
  const visit = (at, relative = "") => {
    for (const entry of io.readdirSync(at, { withFileTypes: true })) {
      const file = path.join(at, entry.name),
        name = path.posix.join(relative, entry.name);
      if (entry.isSymbolicLink()) throw new Error("插件树不允许目录链接");
      if (entry.isDirectory()) visit(file, name);
      else if (entry.isFile() && name !== "deploy-manifest.json")
        result[name] = createHash("sha256").update(io.readFileSync(file)).digest("hex");
    }
  };
  visit(dir);
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b, "en")));
}
export function deployPlugin({ source, target, keep = 8, verify = () => {}, fsOps: io = fs }) {
  ({ source, target } = validateDeploymentPaths(source, target, io));
  const parent = path.dirname(target),
    id = new Date().toISOString().replace(/\D/g, "") + "-" + randomUUID().slice(0, 8),
    stage = path.join(parent, ".dsh-memory-network.stage-" + id),
    backup = target + ".bak-" + id;
  const remove = (file) => {
    if (
      path.dirname(file) !== parent ||
      (!path.basename(file).startsWith(".dsh-memory-network.stage-") &&
        !path.basename(file).startsWith("dsh-memory-network.bak-") &&
        file !== target)
    )
      throw new Error("拒绝清理目标范围外目录");
    noLinks(file, io);
    if (io.existsSync(file)) io.rmSync(file, { recursive: true, force: true });
  };
  const expected = treeHashes(source, io);
  const check = (dir) => {
    if (JSON.stringify(treeHashes(dir, io)) !== JSON.stringify(expected)) throw new Error("部署文件哈希校验失败");
    verify(dir);
  };
  io.mkdirSync(parent, { recursive: true });
  let moved = false,
    installed = false;
  try {
    io.cpSync(source, stage, { recursive: true });
    check(stage);
    if (io.existsSync(target)) {
      io.renameSync(target, backup);
      moved = true;
    }
    io.renameSync(stage, target);
    installed = true;
    check(target);
    const manifest = {
      deployedAt: new Date().toISOString(),
      source,
      target,
      backup: moved ? backup : null,
      files: expected,
    };
    io.writeFileSync(path.join(target, "deploy-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  } catch (error) {
    try {
      if (installed) remove(target);
      if (moved) io.renameSync(backup, target);
    } catch (recovery) {
      throw new AggregateError([error, recovery], "部署失败且自动恢复未完成；旧插件仍在备份目录：" + backup);
    }
    throw error;
  } finally {
    remove(stage);
  }
  const warnings = [];
  try {
    const backups = io
      .readdirSync(parent)
      .filter((name) => name.startsWith("dsh-memory-network.bak-"))
      .sort();
    const limit = Number.isInteger(Number(keep)) ? Math.max(1, Number(keep)) : 8;
    for (const name of backups.slice(0, Math.max(0, backups.length - limit))) remove(path.join(parent, name));
  } catch {
    warnings.push("安装成功，旧备份清理未完成，请检查目录");
  }
  return { target, backup: moved ? backup : null, files: expected, warnings };
}
