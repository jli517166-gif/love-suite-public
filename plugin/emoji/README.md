# QQ 表情手册（数据说明）

`qq-faces.json` 是 DSH 侧唯一的 QQ 表情字典，`dsh-memory-network` 用它把
`[QQ表情:id]` 注解成「名称｜含义」。`QQ表情手册.md` 是同一份表格的人读版。

## 数据形状

```json
{
  "version": 1,
  "updated": "2026-10-30",
  "source": "QQ face table (id = OneBot face segment id / QSid)",
  "count": 329,
  "faces": {
    "14": { "name": "微笑", "note": "礼貌、疏远或无语的笑，不是开心" },
    "361": { "name": "狗狗笑哭", "pack": "汪汪" }
  }
}
```

- `id`：OneBot `face` 段的 `id`，也就是 QQ 的 QSid。QQ 9.x 的新版黄脸是 450–484。
- `name`：QQ 表情名（`QDes` 去掉前导 `/`）。
- `note`：**QQ 语境里的真实含义**，不是字面意思。没写就是名字已经够清楚。
- `pack`：表情包名（汪汪 / 噗噗星人 / 企鹅 / QQ黄脸 / 喜花妮）。
- `note` 里不要以「名称：」开头——注解渲染就是 `名称｜含义`，会重复。

## 来源

NapCat 内置的 QQ 表情配置（`emoji-entries` / `JSON.parse(...QDes...)`）导出的 id → 名称表，
共 329 条；「含义」是人工按 QQ 的实际用法补的，重点覆盖经典黄脸和新版高频表情。

## 怎么补

直接改 `qq-faces.json` 的 `note` 字段，然后重启 DSH（插件启动时读一次，进程内缓存）。
新表情只要加一条 `"1234": {"name": "新表情", "note": "..."}`。
