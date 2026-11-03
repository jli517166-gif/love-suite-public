# 来源与分工（Credits）

一句话：**这个插件的代码、记忆模型、面板、星图、安装/自愈流程是本项目自己写的**；下面列的是「看过思路」和「直接依赖」的项目，没有复制它们的代码。

## 参考过思路（无代码复制）

| 项目 | 参考了什么 | 对应到本项目的哪里 |
|---|---|---|
| [distilly](https://github.com/titanwings/distilly)（原 `colleague-skill`，MIT） | 「把真人蒸馏成技能」的产品概念：源材料 → 人格/口吻/边界 → 可版本化 | `love_distill` 工具、`skills/persona-distill/SKILL.md`。实现用的是本项目自己的 `installPersona` + `SKILL.md` 格式，没有复制它的代码 |
| [OpenViking](https://github.com/volcengine/OpenViking)（AGPL-3.0） | 记忆 / RAG / 技能统一的产品定位，用来对照和评估自己 | 只出现在对比和评估文档里，没有接入，也没有复制代码 |
| [AIRI](https://github.com/moeru-ai/airi)（MIT） | 情绪/动作字段的命名习惯（`happy` / `sad` / `awkward`、`Happy` / `Sad`、`valence` / `arousal`） | `plugin/airi-state.js`：把本插件的心情映射成 AIRI 能读的字段；映射是自己写的，没有引入 AIRI 代码 |
| [meow-memory](https://github.com/Phant0Meow/dsh-meow-memory)（MIT） | 长期记忆后端；本项目只检测它有没有装、把它的提示排除在入站消息之外 | `setup.js`、`isInboundUserMessage`。不是本项目代码 |
| [dsh-onebot](https://github.com/mario841859784/dsh-onebot)（BSD-3-Clause，包名 `dsh-onebot-qq`） | QQ 传输层；本项目通过它的注入文件 / HTTP 接口对接 | `channels/qq.js`、`setup-repair.js`。没有复制它的代码 |
| [NapCat](https://github.com/NapNeko/NapCatQQ)（以仓库许可证为准） | 外部 QQ 客户端；安装器只改它的配置（反向 WS、HTTP 直发） | `install.ps1`、`setup-repair.js` |
| DeepSeek Harness | 插件 API、客户端模块约定、`package.json` 的 `dsh` 字段 | 所有插件入口与面板 |

## 本项目原创

- **服务端** `plugin/index.js`：记忆模型（称呼/偏好/边界/关系/日记/小生活/自我/学习）、心情生成、心跳与冲动、主动调度与发件箱、人格切换/安装、工具、HTTP API、多工作区、doctor/repair。
- **模板系统** `plugin/compose.js` + `plugin/templates.js`：按「在做什么 / 心情」分组，支持增删改和默认回退。
- **面板** `plugin/client.js`：五个页签、状态栏、错误边界、模板 CRUD、设置、向导、气泡说明、恢复出厂。
- **记忆星图** `plugin/star/`：图层、搜索、检视面板、3D 渲染（three.js 只负责画）。
- **AIRI 状态桥** `plugin/airi-state.js`：心情 → 情绪/动作/强度/在场。
- **安装与自愈** `plugin/setup.js`、`plugin/setup-repair.js`、`install.ps1`、`build-release.ps1`、`patches/deploy.mjs`。
- **测试** `plugin/patches/verify-*.mjs`：105 项自检。
- **人格蒸馏工作流** `skills/persona-distill/SKILL.md`。
- **文档与上架材料** `MANUAL.md`、`CONFIG.md`、`marketplace/`。

## 第三方依赖（不是我们写的）

| 依赖 | 用途 | 许可证 |
|---|---|---|
| [three.js](https://threejs.org/)（`plugin/star/vendor/three.min.js`） | 星图 3D 渲染 | MIT |
| React（由 DSH 客户端提供，`require("react")`） | 面板 UI | MIT |
| `@deepseek-ai/schemastery`（peer） | 配置 schema | MIT |
| [meow-memory](https://github.com/Phant0Meow/dsh-meow-memory) | 长期记忆（可选） | MIT |
| [dsh-onebot](https://github.com/mario841859784/dsh-onebot) | QQ 传输 | BSD-3-Clause |
| [NapCat](https://github.com/NapNeko/NapCatQQ) | QQ 客户端（外部程序） | 以仓库为准 |
| jsdom | 测试（不随插件发布） | MIT |
| Playwright | 测试（不随插件发布） | Apache-2.0 |

## 边界声明

- 没有从 distilly（原 colleague-skill）、OpenViking 复制代码；只参考产品思路，实现是独立的。
- 没有把 meow-memory、dsh-onebot 的代码打包进本仓库；它们是可选依赖/外部程序。
- 如果以后引入第三方代码，会在这个文件补来源和许可证。

2026-11-01研究补充：阶段路线参考[Mem0](https://github.com/mem0ai/mem0)的记忆更新、[Graphiti](https://github.com/getzep/graphiti)的时间与混合检索、[Letta](https://github.com/letta-ai/letta)的持久身份/记忆、[LangMem](https://github.com/langchain-ai/langmem)的记忆类型及前台/后台整理设计。本轮未复制代码、提示词或评测数据，也未新增这些项目的运行依赖；本地质量样例和实现为本项目编写。研究来源与采用范围见docs/COMPANION-ROADMAP.md。

## English

The plugin code, memory model, UI, star map, installer and self-repair flow are original work of this project. We referenced product ideas from distilly (formerly colleague-skill, MIT) and OpenViking (AGPL-3.0) but copied no code. AIRI's field names (MIT) inspired the state mapping; the mapping itself is ours. meow-memory (MIT), dsh-onebot (BSD-3-Clause) and NapCat are external dependencies/programs, not bundled code. three.js (MIT) is vendored only for the star map renderer.
