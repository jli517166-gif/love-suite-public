/** Exercise real npm pack/install, without publishing or fetching peer packages. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
const plugin = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.dirname(plugin);
const npmCli = [process.env.npm_execpath, path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'), path.resolve(path.dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js')].filter(Boolean).find((file) => fs.existsSync(file));
if (!npmCli) throw new Error('无法定位 npm CLI');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'love-install-check-'));
function npm(args, cwd) {
  const result = spawnSync(process.execPath, [npmCli, ...args], { cwd, encoding: 'utf8', timeout: 120000 });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || String(result.error));
  return result.stdout;
}
try {
  const packages = [];
  for (const directory of [root, plugin]) {
    const packed = JSON.parse(npm(['pack', '--ignore-scripts', '--json', '--pack-destination', temporary], directory))[0];
    const files = new Set(packed.files.map((item) => item.path));
    const prefix = directory === root ? 'plugin/' : '';
    for (const file of fs.readdirSync(plugin).filter((name) => name.endsWith('.js'))) assert.ok(files.has(prefix + file), '打包缺运行模块：' + prefix + file);
    for (const file of ['star/index.html', 'star/alt.html', 'star/vendor/three.min.js', 'star/vendor/3d-force-graph.min.js', 'cordis.patch.yml']) assert.ok(files.has(prefix + file), '打包缺资源：' + prefix + file);
    const saved = path.join(temporary, (directory === root ? 'root-' : 'plugin-') + packed.filename);
    fs.renameSync(path.join(temporary, packed.filename), saved);
    packages.push(saved);
    console.log('ok   安装包：' + (directory === root ? '仓库根包' : '独立插件包') + '包含全部运行模块和星图资源');
  }
  for (let i = 0; i < packages.length; i += 1) {
    const consumer = path.join(temporary, 'consumer-' + i);
    fs.mkdirSync(consumer);
    npm(['install', '--prefix', consumer, packages[i], '--ignore-scripts', '--legacy-peer-deps', '--no-audit', '--no-fund', '--no-package-lock'], consumer);
    const peerRoot = path.join(consumer, 'node_modules', '@deepseek-ai');
    fs.mkdirSync(peerRoot, { recursive: true });
    const peer = fs.realpathSync(path.join(root, 'node_modules', '@deepseek-ai', 'schemastery'));
    fs.symlinkSync(peer, path.join(peerRoot, 'schemastery'), process.platform === 'win32' ? 'junction' : 'dir');
    const entry = path.join(consumer, 'node_modules', 'dsh-memory-network', i === 0 ? 'plugin/index.js' : 'index.js');
    const imported = await import(pathToFileURL(entry).href);
    assert.equal(imported.name, 'dsh-memory-network');
    assert.equal(typeof imported.apply, 'function');
    console.log('ok   安装包：干净目录安装后入口及依赖模块可导入（使用已安装的宿主 peer）');
  }
} finally {
  assert.equal(path.dirname(temporary), path.resolve(os.tmpdir()));
  fs.rmSync(temporary, { recursive: true, force: true });
}
