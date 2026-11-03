#!/usr/bin/env node
/** Verify, stage, validate, replace, validate. Restore the original on failure. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { deployPlugin, validateDeploymentPaths } from "./deployment.js";
const here = path.dirname(fileURLToPath(import.meta.url)),
  args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf("--" + name);
  return i >= 0 ? args[i + 1] : fallback;
};
let source = path.resolve(here, "..");
const target = path.resolve(
  arg(
    "to",
    process.env.DSH_MEMORY_NETWORK_DIR ||
      path.join(
        process.env.USERPROFILE || process.env.HOME || "",
        ".dsh/profiles/desktop/node_modules/dsh-memory-network",
      ),
  ),
);
if (args.includes("--rollback")) {
  const parent = path.dirname(target);
  const backups = fs.existsSync(parent)
    ? fs
        .readdirSync(parent)
        .filter((n) => n.startsWith("dsh-memory-network.bak-"))
        .sort()
    : [];
  if (!backups.length) throw new Error("没有可回滚的备份");
  source = path.join(parent, backups.at(-1));
}
validateDeploymentPaths(source, target);
if (!args.includes("--skip-tests") && !args.includes("--rollback")) {
  const check = spawnSync(process.execPath, [path.join(here, "verify-all.mjs")], { stdio: "inherit" });
  if (check.status !== 0) {
    console.error("自检没过，拒绝部署");
    process.exit(1);
  }
}
const result = deployPlugin({ source, target, keep: Number(arg("keep", 8)) });
console.log(JSON.stringify({ action: args.includes("--rollback") ? "rollback" : "deploy", ...result }, null, 2));
console.log("部署已验证，正常重启DSH后生效；回滚：node plugin/patches/deploy.mjs --rollback");
