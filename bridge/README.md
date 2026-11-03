# love-state（脑 → 身体的状态桥）

把 love 的记忆文件翻译成「她此刻的状态」，暴露成 HTTP，让 AIRI 之类的身体轮询。
**只读、不调模型、不写记忆，跑一天 0 token。**

## 跑

```powershell
node love-state.mjs                 # 127.0.0.1:8790
node love-state.mjs --port 8791     # 换端口（8765 被别的服务占了）
node love-state.mjs --once          # 只打印一次，方便排查
```

双击 `start-love-state.bat` 可以最小化窗口常驻。想换工作区用 `--workspace` 或环境变量 `LOVE_WORKSPACE`。

## 接口

`GET /state`：

```json
{
  "updated": "2026-10-30T18:57:05",
  "source": "love-companion",
  "emotion": "neutral",
  "motion": "Idle",
  "intensity": 0.3,
  "valence": 0,
  "arousal": 0.2,
  "moodRaw": { "emotion": "平静", "causes": [] },
  "relationship": { "stage": "初识", "affection": 5, "trust": 5 },
  "presence": { "activity": "idle", "speaking": false, "secondsSinceLastEvent": 2353 },
  "call": null
}
```

`GET /health` -> `{ "ok": true, "workspace": "..." }`。都带 `Access-Control-Allow-Origin: *`，浏览器里也能直接取。

## 情绪映射（love 九种 → AIRI 九种）

| love | AIRI | 动作名 |
|---|---|---|
| 开心 / 兴奋 | happy | Happy |
| 平静 | neutral | Idle |
| 害羞 / 不安 | awkward | Awkward |
| 想念 | think | Think |
| 难过 / 委屈 | sad | Sad |
| 生气 | angry | Angry |

`intensity` 是 0–1，身体侧可以拿它做表情混合权重，别直接切动作。

## AIRI 侧怎么接

- 每 200–1000ms 轮询一次 `/state`，`emotion` 变了再切动作，`intensity` 做过渡。
- 别每帧请求；这个接口是给人/给状态机用的，不是渲染循环的。
- `presence.activity`：`speaking`（刚说完，≤10s）/ `chatting`（≤120s）/ `idle`。
  目前是从会话文件 mtime 推断的粗粒度；要精确口型同步，需要 Agent Voice 在 TTS 开始/结束时回调（下一步）。

## 注意

- 端口默认 8790：8765 在你机器上被一个 python 服务占用。
- 状态源是 `love/memory/*.json`，DSH 不运行也能读到（只是不会更新）。
- 这里不产生任何模型调用，所以和 token 预算无关。
