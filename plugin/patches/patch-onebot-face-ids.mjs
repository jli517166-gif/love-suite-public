#!/usr/bin/env node
/**
 * 给 dsh-onebot-qq 打「保留 QQ 表情 id」补丁。
 *
 * 默认实现会把 QQ 小黄脸按顺序映射成 Unicode emoji（微笑(14) → 🥰、崇拜(318)
 * → 🦓、比心(319) → 🦌），id 在入站那一刻就丢了，模型只能瞎猜。本补丁只做一件事：
 * face 段渲染成 `[QQ表情:id]`，把 id 留给 love-companion 的表情手册去注解名称和含义。
 *
 * 补丁点：
 *   lib/cq.js       parseMessage 的 face / mface 段（mface 顺带带上表情包名字）
 *   lib/inbound.js  nodeContentText（合并转发里的 face）
 *
 * 用法：
 *   node patches/patch-onebot-face-ids.mjs            # 自动找 desktop profile 里的副本
 *   node patches/patch-onebot-face-ids.mjs --check    # 只检查，不写文件
 *   node patches/patch-onebot-face-ids.mjs --dir "C:\...\node_modules\dsh-onebot-qq"
 *
 * 幂等：已打过的文件跳过。改文件前备份成 <file>.bak-face-<时间戳>。
 * 注意：`pnpm install` / 升级 dsh-onebot-qq 会覆盖补丁，重跑一次即可。
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

const MARK = "[QQ表情:";

const CQ_FACE_RE = /case 'face':\s*\n\s*textParts\.push\(faceToEmoji\(seg\.data\.id \?\? ''\)\);\s*\n(\s*)break;/;
const CQ_FACE_NEW =
  "case 'face':\n" +
  "                // 保留 QQ 表情 id，交给 love-companion 的表情手册注解含义\n" +
  "                textParts.push('[QQ表情:' + (seg.data.id ?? '') + ']');\n" +
  "                break;";

const CQ_MFACE_BLOCK =
  "case 'mface': {\n" +
  "                const sticker = String(seg.data.summary ?? '').replace(/^\\[|\\]$/g, '');\n" +
  "                textParts.push(sticker ? `[QQ表情包:${sticker}]` : '[QQ表情包]');\n" +
  "                break;\n" +
  "            }\n" +
  "            ";

const INBOUND_FACE_RE = /if \(s\?\.type === 'face'\)\s*\n(\s*)return '😀';/;
const INBOUND_FACE_NEW = "if (s?.type === 'face')\n                return '[QQ表情:' + (s.data?.id ?? '') + ']';";

const CQ_APPEND_IMAGE_FROM = [
  "    const appendImage = (data) => {",
  "        const subType = data.sub_type ?? data['sub-type'];",
  "        if (subType === '1') {",
  "            textParts.push('[表情包]');",
  "            return;",
  "        }",
  "        media.push({ kind: 'image', url: data.url || undefined, file: data.file || undefined, subType });",
  "        textParts.push('[图片]');",
  "    };",
].join("\n");

const CQ_APPEND_IMAGE_TO = [
  "    const appendImage = (data) => {",
  "        const subType = data.sub_type ?? data['sub-type'];",
  "        // 表情包也保留 media ref，才能把本地路径交出来（love-companion 会收进小图库）",
  "        media.push({ kind: 'image', url: data.url || undefined, file: data.file || undefined, subType, sticker: subType === '1' });",
  "        textParts.push(subType === '1' ? '[表情包]' : '[图片]');",
  "    };",
].join("\n");

const INBOUND_PLACEHOLDER_FROM = "        case 'image': return '[图片]';";
const INBOUND_PLACEHOLDER_TO = "        case 'image': return ref.sticker === true ? '[表情包]' : '[图片]';";
const INBOUND_MEDIA_RETURN_FROM = "                return '[图片:' + resolved.path + ']';";
const INBOUND_MEDIA_RETURN_TO = "                return (ref.sticker === true ? '[表情包:' : '[图片:') + resolved.path + ']';";

function packageCandidates() {
  const out = [];
  const env = process.env.DSH_PROFILE_DIR;
  if (env) out.push(path.join(env, "node_modules", "dsh-onebot-qq"));
  const home = process.env.DSH_HOME || path.join(os.homedir(), ".dsh");
  out.push(path.join(home, "profiles", "desktop", "node_modules", "dsh-onebot-qq"));
  // 插件装进 profile 后，从 patches/ 往上两级就是 node_modules
  out.push(path.join(HERE, "..", "..", "dsh-onebot-qq"));
  return out.map(p => path.resolve(p));
}

function resolvePackageDir(argv) {
  const at = argv.indexOf("--dir");
  if (at >= 0) {
    const given = argv[at + 1];
    if (!given) throw new Error("--dir 后面要跟 dsh-onebot-qq 目录");
    return path.resolve(given);
  }
  for (const candidate of packageCandidates()) {
    if (fs.existsSync(path.join(candidate, "lib", "cq.js"))) return candidate;
  }
  throw new Error("找不到 dsh-onebot-qq；用 --dir 指定，或先设置 DSH_PROFILE_DIR。");
}

/** 补丁 cq.js：face 保留 id，mface 带上名字，表情包保留本地路径。 */
function patchCq(source) {
  let next = source;
  if (!next.includes(MARK)) {
    if (!CQ_FACE_RE.test(next)) throw new Error("cq.js 里没匹配到 face 渲染代码（版本可能变了）");
    next = next.replace(CQ_FACE_RE, CQ_FACE_NEW);
  }
  if (!next.includes("case 'mface':") && /case 'image':/.test(next)) {
    next = next.replace(/(\n\s*)case 'image':/, `$1${CQ_MFACE_BLOCK}case 'image':`);
  }
  // 表情包（sub_type=1）原来只留一个占位符，路径被丢掉；改成保留 media ref
  if (!next.includes("sticker: subType === '1'") && next.includes(CQ_APPEND_IMAGE_FROM)) {
    next = next.replace(CQ_APPEND_IMAGE_FROM, CQ_APPEND_IMAGE_TO);
  }
  return next;
}

/** 补丁 inbound.js：合并转发 face 保留 id；表情包占位符与路径注解。 */
function patchInbound(source) {
  let next = source;
  if (!next.includes(MARK)) {
    if (!INBOUND_FACE_RE.test(next)) throw new Error("inbound.js 里没匹配到 nodeContentText 的 face 分支（版本可能变了）");
    next = next.replace(INBOUND_FACE_RE, INBOUND_FACE_NEW);
  }
  if (!next.includes("ref.sticker === true ? '[表情包]'") && next.includes(INBOUND_PLACEHOLDER_FROM)) {
    next = next.replace(INBOUND_PLACEHOLDER_FROM, INBOUND_PLACEHOLDER_TO);
  }
  if (!next.includes("ref.sticker === true ? '[表情包:'") && next.includes(INBOUND_MEDIA_RETURN_FROM)) {
    next = next.replace(INBOUND_MEDIA_RETURN_FROM, INBOUND_MEDIA_RETURN_TO);
  }
  return next;
}

function stamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
}

function main() {
  const argv = process.argv.slice(2);
  const check = argv.includes("--check");
  const dir = resolvePackageDir(argv);
  const jobs = [
    ["lib/cq.js", patchCq],
    ["lib/inbound.js", patchInbound],
  ];
  let failed = false;
  for (const [rel, patch] of jobs) {
    const file = path.join(dir, rel);
    if (!fs.existsSync(file)) {
      console.log(`${rel}: 文件不存在，跳过`);
      continue;
    }
    const before = fs.readFileSync(file, "utf8");
    let after;
    try {
      after = patch(before);
    } catch (error) {
      console.log(`${rel}: ${error.message}`);
      failed = true;
      continue;
    }
    if (after === before) {
      console.log(`${rel}: 已是补丁后的状态`);
      continue;
    }
    if (check) {
      console.log(`${rel}: 未打补丁`);
      failed = true;
      continue;
    }
    const backup = `${file}.bak-face-${stamp()}`;
    fs.copyFileSync(file, backup);
    fs.writeFileSync(file, after, "utf8");
    console.log(`${rel}: 已打补丁（备份 ${path.basename(backup)}）`);
  }
  console.log(check ? "" : "重启 DSH 后生效。");
  if (failed) process.exitCode = check ? 1 : 2;
}

try {
  main();
} catch (error) {
  console.error("补丁失败：" + (error?.message ?? error));
  process.exitCode = 2;
}
