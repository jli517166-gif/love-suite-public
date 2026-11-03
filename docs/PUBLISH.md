# 发布到 npm / 市场

> **暂缓发布**：当前处于测试阶段（`1.15.0`），尚未完成 7–14 天自然日用验证。
> 不要按本文直接发布 npm、标签或市场条目；先让 README 的状态说明和测试结果过关。

当前已经有 GitHub 安装：

```powershell
dsh plugin add github:jli517166-gif/love-suite-public
```

npm 包还没发。这个文件是发布清单。

## 1. 本机登录 npm

```powershell
npm login
npm whoami
```

## 2. 校验包内容

```powershell
npm pack --dry-run
```

应该包含：

- `plugin/index.js`、`client.js`、`star/`、`package.json`、`cordis.patch.yml`
- `README.md`、`MANUAL.md`、`LICENSE`、`CREDITS.md`

不应该包含：

- `node_modules/`、测试依赖、截图源文件以外的临时文件

## 3. 发布

```powershell
npm publish --access public
```

包名：`dsh-memory-network`

## 4. GitHub Actions 自动发布（可选）

仓库已经加了 `.github/workflows/publish.yml`：

1. 在 npm 生成 Automation token
2. 仓库 Settings → Secrets → Actions 新建 `NPM_TOKEN`
3. 打 tag 并推送：

```powershell
git tag v0.52.0
git push origin v0.52.0
```

工作流会跑测试并 `npm publish`。

## 5. GitHub Release 资产（自动）

打 tag 后 `.github/workflows/release-assets.yml` 会：

- `npm pack` 生成 `dsh-memory-network-*.tgz`
- `git archive` 生成 `love-suite-source.zip`
- 两个文件自动挂到 Release

用户可以直接下载 zip 跑 `install.ps1`，不依赖 npm。

## 6. 市场提交

- dsh.so：https://www.dsh.so/zh/submit/
- 条目参考：`marketplace/listing.json`
- 截图：
  - https://raw.githubusercontent.com/jli517166-gif/love-suite-public/main/plugin/docs/panel.png
  - https://raw.githubusercontent.com/jli517166-gif/love-suite-public/main/plugin/docs/star.png

## 注意

- npm 包名 `dsh-memory-network` 未被占用时才能发；被占用就要改 `package.json` 的 `name`
- 发之前先确认 `package.json` 的 `files` 不包含测试依赖
- GitHub tag 发布和 npm 发布是两条线，互不影响
