# dsh-love-semantic

`dsh-memory-network` 的可选语义检索包。独立安装、独立发布；不装时主插件仍用 BM25。

## 安装

```powershell
npm install dsh-love-semantic
```

首次调用会从 Hugging Face 下载 `Xenova/bge-small-zh-v1.5`（约 100MB），缓存到：

`%USERPROFILE%\.dsh\love-semantic\models`

之后离线可用。不调用云 API。

## API

```js
import { embed, embedMany, rankBySemantic, rerank } from "dsh-love-semantic";

const vector = await embed("上次让我很难过的事");

const ranked = await rankBySemantic("上次让我很难过的事", items, (item) => item.text, { limit: 5 });
// [{ item, score }]

const items2 = await rerank("上次让我很难过的事", items, { limit: 5 });
```

## 环境变量

| 变量 | 说明 |
|---|---|
| `LOVE_SEMANTIC_MODEL` | 模型名，默认 `Xenova/bge-small-zh-v1.5` |
| `LOVE_SEMANTIC_CACHE` | 模型缓存目录 |

## 主插件集成

主插件保持关键词检索为默认；检测到本包时，可以在 `love_recall` 的候选集上做二次语义排序。

建议流程：

1. BM25 先取前 20 条候选
2. 语义模型对这 20 条重排，取前 5
3. 模型不可用时自动退回 BM25 顺序

## 边界

- 不替你决定“该不该语义检索”，装上才启用
- 首次下载模型需要网络；之后纯本地
- 模型质量取决于 `bge-small-zh-v1.5`，不是通用大模型
- 独立 npm 包，主插件不把它列为硬依赖
