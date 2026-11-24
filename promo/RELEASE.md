# 赠岛宣传片 · 发布文案

成片：`output/giftislands-16x9-{zh,en}-light.mp4`（横屏）、`output/giftislands-9x16-{zh,en}-light.mp4`（竖屏）。

> 发布前：`giftislands.top` 目前还解析不到（DNS 没有 A 记录），片尾和文案里的网址点进去会打不开，先配好域名再发。

## 中文

### 标题（任选一个）

| 平台 | 标题 |
| --- | --- |
| B 站 / 小红书（推荐） | 我发明了一种棋：每一手，都要送对方一子 |
| 抖音 / 视频号 | 每一手都要送对手一枚棋子，你会下吗？ |
| 备选 | 送对位置，对方反而少一座岛｜原创棋类「赠岛」 |

### 正文

```text
我发明了一种新棋，叫「赠岛」。

规则只有三条：
· 每一手下两枚子：一枚给自己，一枚送对方
· 上下左右相连的同色棋子是一座岛，一岛一分，不论大小
· 下满即止，岛多者胜

最妙的一手，往往是送出去的那一子：送对位置，能把对方的两座岛连成一座，对方反而少一分。

打开网页就能下，三档 AI 随时对弈：giftislands.top

#原创棋类 #益智游戏 #策略游戏 #独立游戏 #赠岛
```

### 短版（评论置顶 / 动态）

```text
每一手，一枚给自己，一枚送对方。送对位置，对方反而少一座岛。来下一盘：giftislands.top
```

## English

### Title

| Platform | Title |
| --- | --- |
| YouTube (recommended) | I invented a board game where every move gives your opponent a stone |
| TikTok / Reels / Shorts | Every move, you give your opponent a stone. Would you play this? |
| Alternative | The best move is a gift · Gift Islands, an original board game |

### Description

```text
Gift Islands is a two-player board game I designed.

Three rules:
- Each move, place two stones: one for you, one for your opponent.
- Stones connected side by side form an island. Every island scores one point, big or small.
- When the board is full, most islands wins.

The twist: a well-placed gift can join two of your opponent's islands into one, and they lose a point.

Play in your browser against three AI levels: giftislands.top

#boardgame #puzzlegame #strategygame #indiegame #giftislands
```

### Short

```text
Every move, you give your opponent a stone. Give it in the right place, and they lose an island. There's an island for you: giftislands.top
```

## 封面

- 推荐 30.6 s：两条白岛被送出的子连成一整条蓝色，计数 2，最能说明“送子连岛”。
- 备选 44.5 s：黑方 7 座岛全亮、「黑方胜。」。
- 竖屏平台的封面直接从对应的 9×16 成片截同一时刻。

```bash
ffmpeg -ss 30.6 -i output/giftislands-16x9-zh-light.mp4 -frames:v 1 -q:v 2 cover-16x9-zh.jpg
```
