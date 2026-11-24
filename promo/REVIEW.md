# 赠岛宣传片 · 交付与审片记录

2026-11-23

## 交付物

成片在 `promo/output/`（mp4 不进 git，只在本地）：

| 文件 | 规格 |
| --- | --- |
| `giftislands-16x9-zh-light.mp4` | 主片 · 横屏 · 中文 · 浅色 · 1920×1080 · 30fps · 53.000 s |
| `giftislands-16x9-en-light.mp4` | 主片 · 横屏 · 英文 · 浅色 |
| `giftislands-9x16-zh-light.mp4` | 主片 · 竖屏 · 中文 · 浅色 · 1080×1920 |
| `giftislands-9x16-en-light.mp4` | 主片 · 竖屏 · 英文 · 浅色 |
| `brag-comparison-16x9-zh.mp4` | brag 对比片 · 20 s（封面帧、计划、分享文案在 `brag-output/`） |

每个文件都用 ffprobe 核对过：帧数 1590（对比片 600）、时长与画幅正确、带 AAC 音轨。

## 第二版修改（按你看完第一版的反馈）

| 你说的问题 | 原因 | 改法 |
| --- | --- | --- |
| 字幕一直在抖 | 文字和舞台带着 `will-change` 和“已经是原位”的 transform，被提到独立图层；HyperFrames 用多个浏览器进程并行渲染，每个进程栅格化这个图层的结果有细微差异，拼起来字幕每几帧就移动约 0.8 像素 | 去掉所有 `will-change`；动画结束后 transform 设成 `none`。成片里静止字幕区域逐帧差为 0，质心漂移约 0.001 像素（之前约 0.8） |
| 棋子滑到下一个位置，不像正常下棋 | 第一版把送出的子画成从己方子里“递出去”的弧线飞行 | 每一手改为两次原地落子：先落自己的子，停一拍，再在另一个空格落下送出的子。镜头 4 的预览子也不滑了，先出现在角落、淡出，再出现在缺口 |
| 背景音吵，快速下的时候乱 | 快进时每手两个音、加上每小节的低音和偏湿的混响，叠成一团 | 快进每手只剩一个轻而暗的音，沿和弦往上走成一条线；去掉每小节低音；垫底和弦音量减半；混响 0.9 → 0.6；所有音的高频泛音和起音减弱 |
| 没体现一座岛是怎么计算的 | 第一版只让岛变蓝、计数加一 | 每数一座岛，岛上贴一个蓝色编号角标并保留到镜头结束；加了斜连演示（虚线 + ×），副句「上下左右相连，才算同一座岛。」再接「一岛一分，不论大小。」；终局也给双方每座岛贴编号 |

因为多讲了一层规则，全片从 45 秒加长到 50 秒（镜头 2 +1.3 s、镜头 3 +2.7 s、镜头 4 −1.3 s、镜头 5 +2 s 用来把快进放慢一倍、片尾 +0.3 s）。brag 对比片也同样去掉了滑动和抖动来源，重新渲染。

## 第三版修改

| 你说的问题 | 改法 |
| --- | --- |
| 终局这一页需要停顿 | 判定胜负后多停一小节（约 2.7 s），结果在屏约 3.3 s 才转场；全片 50 s → 53 s |
| 要更明显地标出谁赢了 | 黑方 7 座岛一起亮成蓝色，计数「7」变成蓝色，白方棋子和「5」变淡；主句从「下满即止。」换成「黑方胜。」（英文 Black wins.），副句「岛多者胜。」保留作为理由 |
| 怎样更好地表现“一手落两子” | 同一手的两子只隔 1/4 拍（5 帧）几乎一起落下，蓝色“上一手”小圆点在两子上同时亮起；手与手之间停 2 拍。快进时手内隔 2 帧、手间隔半拍。没有让两子完全同时落，是为了保留字幕说的“先下自己的，再送对方一枚”的顺序。对比片同样处理 |

## 第四版修改

- 片尾的「三档 AI，随时对弈」换成邀请句「有一座岛，在等你。」/ "There’s an island for you."：仍在网址按钮下方、二级灰色，字号 36 → 42（竖屏 40 → 46）；中文句尾「。」右侧留白多，左侧补 0.6em，实测墨迹中心与画面中心偏差 0 px（英文 1 px）；片尾整组在画面里重新居中。
- 只保留浅色版：删除了 4 条深色成片和深浅对比图。

## 和 PLAN.md 不一样的地方

1. **`product-launch-video` 已被 HeyGen 退役。** 2026-11 的 HyperFrames 仓库里它已并入 `hyperframes` skill（`references/types/launch.md`），所以项目级装的是它的继任者 `hyperframes` + `hyperframes-cli`，以及 `brag`。装之前克隆到临时目录读过 `SKILL.md`、引用文档和全部脚本：启动器只通过 `npx` 拉取官方 `hyperframes` CLI，brag 只有一个分析音乐的 Python 脚本，没发现可疑命令。
2. **没有停下来等审。** 按你的要求全程不提问：分镜、文案写好后直接制作；配色由我定（见下）。分镜和文案都在 `STORYBOARD.md`、`SCRIPT.md`，想改哪句告诉我，改完重渲一条只要十几秒。
3. **配色最终用浅色。** 第一版我选了深色，你看完后定为浅色，深色版成片已全部删除；代码里的深色主题保留，`theme` 变量默认改为 `light`。
4. **遥测全部关闭。** HyperFrames skill 默认会发使用统计，因为没法征求你的同意，所有命令都带了 `HYPERFRAMES_NO_TELEMETRY=1`，也没发反馈评分。
5. **brag 用的是 brag-slim。** 在 Opus 5.5 上 `/brag` 会自动交给 `/brag-slim`（模型自己写整条片）。为了和主片只比风格，它复用了主片的棋盘引擎和网页配色，渲染工具同样是 HyperFrames。

## 创作上的取舍

- 镜头 2–5 是**同一盘真实的 7×7 对局**（24 手，黑先，终局黑 7 : 白 5，剩 1 空格），每一步都用网页同样的数岛规则校验过，不是摆拍。
- 镜头 4 先演示"送在角落 → 对方 +1（→ 4）"，再换到缺口"→ 2"，最后落子连成一整条：用对比讲清楚为什么这是妙手。31.7 s 再让「黑 5」出现在「白 2」旁边。
- 片尾按钮里直接放网址 `giftislands.top`：视频里的按钮点不了，网址就是行动本身。
- 片头标题字幕中文版写「赠岛 · Gift Islands」，英文版只写「Gift Islands」（棋子已经写出了「赠岛」）。
- 一套源码出全部版本：`lang`、`theme` 是 HyperFrames 变量；竖屏 `vertical/index.html` 由 `tools/make-vertical.cjs` 从横屏生成，`film.js` 按画幅排版。

## 测量过的 / 只看过的 / 没人检查的

- **测量：** `hyperframes check` 横竖两版和对比片都 `ok: true`（含版式、对比度、竖屏安全区）；音轨 -16.2 LUFS、真峰值限制 -1.5 dBTP；成片里静止字幕逐帧像素差为 0。
- **看过：** 横屏 15 个时刻（含编号角标、斜连演示、两次预览、连岛、终局计数、片尾）、竖屏 8 个时刻、对比片 8 个时刻。
- **没人检查：** **新配乐没有人听过**，只做了测量。请重点听 12–14 s 和 35–39 s 两段快进是否已经够安静。

## 保留的警告

| 警告 | 原因 |
| --- | --- |
| `nested_structure_needs_subcomposition`（3 条） | 整片是一个 `renderAt(t)` 纯函数，三个镜头写在一个文件里。只影响 HyperFrames Studio 里的时间线显示，不影响成片 |

## 最弱的一处，以及有更多时间会改什么

- **镜头 5 的快进铺盘**（35.3–39.5 s）已放慢一倍，但 13 手仍然只是“下满了”的感觉，看不清每一手；这是有意的节奏。
- **第 0 帧**只有空海面和刚开始扫开的点阵。如果要在社交平台用作缩略图，可以像对比片那样把一张定格帧烘焙进第 0 帧。

## 怎么改、怎么重渲

```bash
cd promo/film
node tools/music.cjs          # 改了 film-data.js 里的时间后重做配乐
node tools/make-vertical.cjs  # 改了 index.html 或 assets/ 后同步竖屏
HF=../../.claude/skills/hyperframes/scripts/plugin-cli.mjs
HYPERFRAMES_NO_TELEMETRY=1 node $HF render --variables '{"lang":"zh","theme":"light"}' --quality delivery -o renders/giftislands-16x9-zh-light.mp4
HYPERFRAMES_NO_TELEMETRY=1 node $HF render vertical --variables '{"lang":"en","theme":"light"}' --quality delivery -o renders/giftislands-9x16-en-light.mp4
```

项目级 skill 装在 `.claude/skills/`，不进 git（brag 自带 17 MB 音乐素材）。`skills-lock.json` 记下了审查过的版本：hyperframes `96abfaf`、brag `0637943`；在新机器上用 `npx skills add heygen-com/hyperframes --skill hyperframes --skill hyperframes-cli` 和 `npx skills add latent-spaces/brag --skill brag` 重装。

PingFang 字体有版权，原始文件和子集都不进 git；换机器时先把 `PingFangSC-Regular.otf`、`PingFangSC-Semibold.otf` 放进 `film/assets/fonts/`，再跑 `node tools/subset-fonts.cjs`。

## 待你处理

- **giftislands.top 还解析不到**（PLAN.md 里已记），片子里照常用这个域名，发布前需要配好 DNS 和服务器。
