# 打包分享评估（2026-10-30）

> **历史文档**：这份评估写于 `0.3` 之前，部分结论已被后续安装器和 `1.15.0` 取代。
> 当前状态、测试阶段声明和安装方式以 [README.md](README.md) 为准。

## 结论

现在这套是**可运行**，但还不是**可分发**。

给朋友装，需要先解决 5 类问题：路径、凭据、插件版本、QQ/NapCat 依赖、个人数据隔离。代码本身已经模块化得不错，做成“一键安装包”是可行的，但需要一轮参数化 + 安装器，而不是直接压缩文件夹。

## 已经具备的分发能力

- 管理面板里可以指定固定工作区，插件会按这个路径读写（不用改源码）
- 提供了通用 skill 模板：`skills/companion-template/SKILL.md`，不带私人人格
- viewer 继续独立、只读
- Agent Voice / MCP **不在本套件内**，由使用者自行在 Agent Voice 服务里对接

仍然缺的是安装器、凭据收集、版本锁定和首启数据模板。

## 当前组成

| 模块 | 位置 | 分发属性 |
|---|---|---|
| DSH 插件 | `plugin/` | 代码可分发；配置需参数化 |
| 两个 skill | love 项目内 | 内容可分发；路径需替换 |
| 记忆星海 viewer | `D:\App\Git\memory-universe` | 独立只读，可分发 |
| meow-memory | 第三方 npm | 需固定版本 + love-only 补丁 |
| dsh-onebot-qq | 第三方 npm | 需 NapCat/QQ 环境 |
| 个人记忆/人格 | `love/memory` | **不可分发**，需首启生成 |

## 阻塞项

### 1. 绝对路径

插件里硬编码：

```
C:\test\love
<USER_HOME>\.dsh\media\onebot\qq-inject.jsonl
<USER_HOME>\.dsh\sessions\...
C:\NapCat\...
```

分享前必须改成由安装器写入的配置，不能靠改源码。

### 2. 个人凭据

- QQ access token
- NapCat WebUI token
- bot QQ / admin QQ

这些不能进仓库，需要 `.env` / 安装向导收集。

### 3. 插件版本与 DSH 版本

当前 DSH `0.2.1-rc.5`，插件 API 还在 rc 阶段。这次 profile 被升级重置、client bundle id 不匹配导致启动失败，就是版本耦合的代价。

建议发布时锁定：

- DSH 最低/最高版本
- `dsh-onebot-qq` 版本
- `meow-memory` 版本

### 4. QQ / NapCat

QQ 不是纯软件依赖：需要 QQ NT、NapCat、扫码登录、反向 WS 端口、token。朋友如果没有这些，插件装了也不会通。

安装器至少要：

- 检测 NapCat 是否安装
- 检测 8643/6099 端口
- 生成一份 NapCat 反向 WS 配置
- 首次登录引导

### 5. 个人数据

`love/memory`、人格 skill、journal 都是个人内容。发布包应只带：

- 空 profile/relationship/mood 模板
- 人格模板（不带私人记忆）
- 首次启动向导

## 建议的发布结构

```
love-suite/
  plugin/                 dsh-memory-network
  skills/                 whale-persona / companion 模板
  viewer/                 memory-universe
  installer/
    install.ps1           主安装器
    detect.ps1            检测 DSH/NapCat/Node/Python
    write-config.ps1      写入 profile 配置
    first-run.ps1         初始化 love 数据
  docs/
    安装.md
    配置.md
    常见问题.md
  .env.example
  package.json            版本元数据
```

安装流程：

1. 选 DSH profile
2. 选 love 工作区路径
3. 填 QQ/NapCat 参数
4. 装依赖（onebot/meow/love-companion）
5. 写 profile `cordis.patch.yml`（保留已有内容）
6. 拷贝 skills 到 love 项目
7. 初始化空记忆模板
8. 重启 DSH + 提示扫码

## 评估分数

| 维度 | 现在 | 可分发目标 |
|---|---|---|
| 代码结构 | 8/10 | 9/10 |
| 路径可移植 | 2/10 | 9/10 |
| 安装便捷 | 3/10 | 9/10 |
| 版本稳定性 | 5/10 | 8/10 |
| 数据隔离 | 4/10 | 9/10 |
| 文档 | 6/10 | 9/10 |

## 建议优先级

1. 把插件里的路径全部改成配置项（`workspace`、`injectPath`、`statePath`、`sessionDir`）
2. 写 `install.ps1`：复制插件 + 合并 profile 配置 + 拷贝 skills + 初始化空数据
3. 锁定版本并做兼容矩阵
4. 把 love-suite 打成 zip/release；viewer 作为可选子包
5. 首启向导：称呼、人格、QQ 绑定
