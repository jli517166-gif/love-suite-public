# client.js 要不要拆？评估结论

当前 `plugin/client.js` 约 1500 行，`plugin/index.js` 约 2660 行。

## 结论：现在不拆

不是“懒”，是拆了之后构建链会变重，收益暂时抵不过风险。

## 为什么不能像 index.js 那样直接拆

`index.js` 是 Node ESM，拆成 `persona.js` / `backup.js` / `retrieval.js` 只要 `import` 就能工作，测试直接跑源码。

`client.js` 不是这样被加载的：

```js
window.__ModuleLoader__.load({
  id: "dsh-memory-network",
  factory: (require) => { /* 整个面板都在这个闭包里 */ },
});
```

DSH 客户端只加载这一份文件，执行 factory。它**不是浏览器里的 ES module**，所以：

- 不能写 `import { Panel } from "./panel.js"`（没有模块解析）
- 不能 `require("./panel.js")`（`require` 只用于拿 `react`）
- 拆出去的文件不会被打包、不会被服务，运行时直接找不到

要么保持单文件，要么引入构建步骤（esbuild），没有第三条路。

## 如果以后要拆，需要这些成本

1. 新增 `plugin/client-src/`，按页签拆：
   - `ui.jsx`（按钮/输入/气泡/开关）
   - `overview.jsx`
   - `learning.jsx`
   - `templates.jsx`
   - `settings.jsx`
   - `setup.jsx`
   - `panel.jsx`（状态与路由）
2. 引入 esbuild，`build:client` 产出 `client.js`；产物要保留 `window.__ModuleLoader__.load` 包装。
3. 部署脚本改为“先 build 再拷贝”；CI 加 build 步骤和产物哈希检查。
4. 现有 `verify-client-render`、`verify-ui-e2e` 改为测源码或测产物，两者都要覆盖。
5. 回滚粒度变细：构建失败不能污染已部署的 `client.js`。

粗估：半天到一天，之后每次改前端都多一步 build。

## 什么情况下值得拆

满足任意两条再拆：

- `client.js` 超过 2000 行
- 前端连续出现两次“改 A 崩 B”
- 需要多人同时改不同页签
- 需要复用组件到别的插件

## 现在先做什么替代

- **保持单文件，但用测试兜底**：`verify-client-render`（假 React 渲染五页签）+ `verify-ui-e2e`（真 React 点设置保存、模板新增、页签方向键）
- **错误边界**：`PanelBoundary` 已经能把崩溃限制在面板内
- **节段注释**：文件内按 Header / Tabs / Overview / Learning / Templates / Settings / Setup 分段
- **纯逻辑外移**：能独立成 Node 模块的（模板、备份、检索、人格）已经移出 `index.js`，不碰浏览器闭包

## 相关文件

- `plugin/client.js`
- `plugin/patches/verify-client-render.mjs`
- `plugin/patches/verify-ui-e2e.mjs`
- `.github/workflows/verify.yml`
