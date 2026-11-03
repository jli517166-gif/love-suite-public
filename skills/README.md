# skills

分享用**通用模板**（不带私人设定）：

```
skills/companion-template/SKILL.md
```

使用时复制到目标工作区的 `.dsh/skills/companion/SKILL.md`，再配一个独立的人格 skill。

正式文件在 love 项目里，插件不复制一份，避免双份漂移：

```
C:\test\love\.dsh\skills\whale-persona\SKILL.md
C:\test\love\.dsh\skills\companion\SKILL.md
C:\test\love\.dsh\skills\qq-stickers\SKILL.md
C:\test\love\.dsh\skills\qq-voice\SKILL.md
```

人格切换仍由：

```
python "C:\test\love\tools\persona.py" get|set|list
```

`whale-persona` 和 `companion` 已按「心情 + 记忆 + 主动」重写；插件工具优先，Python 脚本只作后备。
