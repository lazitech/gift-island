# 赠岛宣传片 · 交付与审片记录

2026-11-23

## 交付物

成片在 `promo/output/`（mp4 不进 git，只在本地）：

| 文件 | 规格 |
| --- | --- |
| `giftislands-16x9-zh-dark.mp4` | 主片 · 横屏 · 中文 · 深色 · 1920×1080 · 30fps · 45.000 s |
| `giftislands-16x9-en-dark.mp4` | 主片 · 横屏 · 英文 · 深色 |
| `giftislands-9x16-zh-dark.mp4` | 主片 · 竖屏 · 中文 · 深色 · 1080×1920 |
| `giftislands-9x16-en-dark.mp4` | 主片 · 竖屏 · 英文 · 深色 |
| `giftislands-16x9-zh-light.mp4` | 配色对比用的浅色版（横屏中文） |
| `palette-compare.png` | 深色 / 浅色同一时刻并排对比 |
| `brag-comparison-16x9-zh.mp4` | brag 对比片 · 20 s（封面帧、计划、分享文案在 `brag-output/`） |

每个文件都用 ffprobe 核对过：帧数 1350（对比片 600）、时长与画幅正确、带 AAC 音轨。

## 和 PLAN.md 不一样的地方

1. **`product-launch-video` 已被 HeyGen 退役。** 2026-11 的 HyperFrames 仓库里它已并入 `hyperframes` skill（`references/types/launch.md`），所以项目级装的是它的继任者 `hyperframes` + `hyperframes-cli`，以及 `brag`。装之前克隆到临时目录读过 `SKILL.md`、引用文档和全部脚本：启动器只通过 `npx` 拉取官方 `hyperframes` CLI，brag 只有一个分析音乐的 Python 脚本，没发现可疑命令。
2. **没有停下来等审。** 按你的要求全程不提问：分镜、文案写好后直接制作；配色由我定（见下）。分镜和文案都在 `STORYBOARD.md`、`SCRIPT.md`，想改哪句告诉我，改完重渲一条只要十几秒。
3. **配色选了深色。** 浅色版很干净，但白子（半盘棋）在浅海面上只靠阴影和海面区分：片尾「岛」字、镜头 3 里被淡化的白岛几乎看不见。深色版黑白都清楚，蓝色按钮也更跳。浅色版保留在 `output/` 里供你对照。
4. **遥测全部关闭。** HyperFrames skill 默认会发使用统计，因为没法征求你的同意，所有命令都带了 `HYPERFRAMES_NO_TELEMETRY=1`，也没发反馈评分。
5. **brag 用的是 brag-slim。** 在 Opus 5.5 上 `/brag` 会自动交给 `/brag-slim`（模型自己写整条片）。为了和主片只比风格，它复用了主片的棋盘引擎和网页配色，渲染工具同样是 HyperFrames。

## 创作上的取舍

- 镜头 2–5 是**同一盘真实的 7×7 对局**（24 手，黑先，终局黑 7 : 白 5，剩 1 空格），每一步都用网页同样的数岛规则校验过，不是摆拍。
- 镜头 4 先演示"送在角落 → 对方 +1（→ 4）"，再滑到天元"→ 2"，最后落子连成一整条：用对比讲清楚为什么这是妙手。28 s 时再让「黑 5」出现在「白 2」旁边，补上原来 3.75 s 的静止段。
- 片尾按钮里直接放网址 `giftislands.top`：视频里的按钮点不了，网址就是行动本身。
- 片头标题字幕中文版写「赠岛 · Gift Islands」，英文版只写「Gift Islands」（棋子已经写出了「赠岛」）。
- 一套源码出全部版本：`lang`、`theme` 是 HyperFrames 变量；竖屏 `vertical/index.html` 由 `tools/make-vertical.cjs` 从横屏生成，`film.js` 按画幅排版。

## 测量过的 / 只看过的 / 没人检查的

- **测量：** `hyperframes check` 横竖两版都 `ok: true`（含版式、对比度、竖屏 TikTok/Reels/Shorts 安全区）；音轨 -16.0 LUFS、真峰值 -1.5 dBFS；关键事件时刻的音频能量都在对应帧之后陡增。
- **看过：** 每个镜头的中点帧和两个转场前后 ±0.2 s 的帧、深浅两版并排、英文与竖屏的断行、对比片 9 个时刻。
- **没人检查：** **配乐没有人听过**，只做了测量。请先听一遍，尤其是马林巴的音色和 25.33 s 的低音。

## 保留的警告

| 警告 | 原因 |
| --- | --- |
| `nested_structure_needs_subcomposition`（3 条） | 整片是一个 `renderAt(t)` 纯函数，三个镜头写在一个文件里。只影响 HyperFrames Studio 里的时间线显示，不影响成片 |
| `line_unread` "→ 2" 0.07 s | 实际在屏 1.33 s（24.67–26.0 s），检查器量到的是它淡出时的残影 |
| `line_unread` "1" 0.07 s（35.8 s） | 终局快速交替数岛，故意快；最终的 7 : 5 停留 2 s 以上 |

## 最弱的一处，以及有更多时间会改什么

- **镜头 5 的快进铺盘**（32.7–34.8 s）只有 2 秒、13 手，第一次看的人只能感觉到"下满了"，看不清每一手。这是有意的节奏，但如果想让终局更好懂，可以把快进放慢一倍、把镜头 6 压短 1 秒。
- **第 0 帧**只有空海面和刚开始扫开的点阵。如果要在社交平台用作缩略图，可以像对比片那样把一张定格帧烘焙进第 0 帧。

## 怎么改、怎么重渲

```bash
cd promo/film
node tools/music.cjs          # 改了 film-data.js 里的时间后重做配乐
node tools/make-vertical.cjs  # 改了 index.html 或 assets/ 后同步竖屏
HF=../../.claude/skills/hyperframes/scripts/plugin-cli.mjs
HYPERFRAMES_NO_TELEMETRY=1 node $HF render --variables '{"lang":"zh","theme":"dark"}' --quality delivery -o renders/giftislands-16x9-zh-dark.mp4
HYPERFRAMES_NO_TELEMETRY=1 node $HF render vertical --variables '{"lang":"en","theme":"dark"}' --quality delivery -o renders/giftislands-9x16-en-dark.mp4
```

项目级 skill 装在 `.claude/skills/`，不进 git（brag 自带 17 MB 音乐素材）。`skills-lock.json` 记下了审查过的版本：hyperframes `96abfaf`、brag `0637943`；在新机器上用 `npx skills add heygen-com/hyperframes --skill hyperframes --skill hyperframes-cli` 和 `npx skills add latent-spaces/brag --skill brag` 重装。

PingFang 字体有版权，原始文件和子集都不进 git；换机器时先把 `PingFangSC-Regular.otf`、`PingFangSC-Semibold.otf` 放进 `film/assets/fonts/`，再跑 `node tools/subset-fonts.cjs`。

## 待你处理

- **giftislands.top 还解析不到**（PLAN.md 里已记），片子里照常用这个域名，发布前需要配好 DNS 和服务器。
