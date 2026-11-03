# love-suite

> **🧪 测试阶段 / Early Testing**
>
> 当前版本 `1.16.0`，仍在真实使用验证中，**不是稳定版**。
> 记忆、核心归纳、长材料分段、语义召回和 QQ 通道都可能出错；遇到误记、漏记、重复、卡住或版本不一致属于正常现象。
> 请先备份工作区，不要把它当作不可替代的唯一记忆库。
>
> 已验证：35 套离线回归、CI、安装哈希核对、有限的真实模型隔离验收。
> 未验证：7–14 天自然日用、实际 embedding、可执行技能学习、长期稳定性。

这是从开发仓库导出的**干净公开快照**：不包含旧提交历史、真实记忆、开发交接和内部验收证据。

DSH 的陪伴插件：人格、记忆、心情、心跳、主动聊天、QQ/群聊、管理面板和记忆星图。

- 本地优先，记忆写入工作区文件
- 不要求云记忆服务
- 不包含 API token
- 只在指定的 love 工作区生效

## 当前能做什么

- **人格**：多套人格切换，只改变说话方式，不换记忆
- **记忆**：核心记忆 + 旧记忆迁移 + 来源/取代历史
- **反思**：有界后台队列，预览/提交分离，预算和失败恢复
- **检索**：关键词 + 同义词；可选语义包，未安装时自动退回关键词
- **心情/心跳**：本地计算，不花模型 token
- **主动聊天**：间隔、时段、跳过概率、发件箱
- **QQ/群聊**：私聊与群聊隔离、群记忆、成员好感
- **面板**：概览、心跳、学习、模板、设置、向导、整理批次
- **星图**：主星图读取真实记忆；`alt.html?demo=brain` 是动态假数据演示

## 安装

> 当前是公开测试版，可以直接用下面的 GitHub 方式安装。  
> 仍是 `1.x` 测试阶段，不建议作为唯一记忆库。

### 从 GitHub 安装

```powershell
dsh plugin add github:jli517166-gif/love-suite-public
```

### 或用仓库安装器

```powershell
# 只体检，不改文件
powershell -ExecutionPolicy Bypass -File .\install.ps1 -DryRun

# 安装并配置 QQ
powershell -ExecutionPolicy Bypass -File .\install.ps1 -OwnerQQ 你的QQ号
```

安装后：

1. 重启 NapCat（如使用 QQ）
2. 完全重启 DSH
3. 打开面板「向导」核对工作区、通道、NapCat
4. 在面板「设置 → 聊天工作区」选择你的工作区

不使用 QQ 也可以：记忆、心情、星图、人格都在，只是没有 QQ 通道。

## 数据放在哪

默认工作区：`~/love`，也可以在面板里改。

```text
<workspace>/memory/
  profile.json          称呼、偏好、边界
  relationship.json     关系与好感
  mood.json             当前心情
  journal/              日记
  life.jsonl            小生活
  core-memory.json      核心记忆与来源
  reflection-queue.json 反思队列
  reflection-worker.json 后台预算
```

记忆是本地文件；请自行备份。测试、调试或换工作区前先复制整个 `memory/`。

## 文档

- [MANUAL.md](MANUAL.md)：大白话使用手册
- [CONFIG.md](CONFIG.md)：配置、目录、通道
- [INSTALL_PROMPT.md](INSTALL_PROMPT.md)：把整段发给 DSH Agent 自动安装
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)：模块边界
- [docs/RUNBOOK.md](docs/RUNBOOK.md)：部署、恢复、真实模型验收
- [docs/COMPANION-ROADMAP.md](docs/COMPANION-ROADMAP.md)：核心目标与阶段
- [CREDITS.md](CREDITS.md)：参考项目与原创说明
- [docs/PRIVACY-AUDIT.md](docs/PRIVACY-AUDIT.md)：公开仓库隐私与数据边界
- [SECURITY.md](SECURITY.md)：测试阶段的安全报告边界

## 测试与验证

```powershell
npm ci --ignore-scripts --no-audit --no-fund
npm test
```

完整回归当前为 35 套；真实模型验收是单独命令，默认不跑，会计费。

当前不声称：

- 任意改写都能语义召回（没有实际 embedding）
- 长期自主形成合理核心（真实样本仍很少）
- 可执行技能学习（`love_learn` 目前只是能力笔记）
- 所有空结果/并发/越界路径都已封闭

## 项目状态

- 版本：`1.16.0`
- 分支：`main`
- 测试阶段，接口、数据格式和 UI 仍可能变化
- npm / 市场发布暂缓
- 星图当前冻结；没有明确问题不再改视觉

## 边界

- DSH 不运行时插件不会主动发消息
- 插件依赖 DSH 的宿主接口；DSH 升级后先看日志
- 非 love 工作区调用工具会被拒绝
- 不包含 Agent Voice、AIRI 身体、云端同步
- 不提供任意 shell、任意文件写入或浏览器自动化能力

## License

MIT。参考项目见 [CREDITS.md](CREDITS.md)。
