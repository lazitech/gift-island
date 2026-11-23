# /brag-slim plan — Gift Islands (对比片)

Run by `/brag` on Opus 5.5, which hands off to `/brag-slim`. Default options: tone `default`
(punchy, playful, clean), landscape 1920×1080, 30 fps, about 20 s. Chinese copy, to compare
directly with the main film's 16:9 Chinese cut.

## Inspect

- **What it is:** a new two-player board game where every move places one stone for you and one for your opponent; most islands wins.
- **For whom:** people who like Go-like abstract games and quick puzzles; play in the browser against three AI levels.
- **What sets it apart:** the gift. Your best move can be the stone you hand the other side.
- **Most impressive claim:** a gift in the right place *lowers* the opponent's score.
- **Visual hook:** the site's own title, 赠岛 written in stones on the sea.
- **Real UI to reuse:** `frontend/board-view.js` geometry (stones, waisted bridges, dot grid, accent "last move" dots, pending ring), `frontend/style.css` tokens (dark theme), the home page's lede and its blue `.cta` button.
- **Share caption:** see `share-copy.txt`.

## Angle

A riddle, answered: "下棋，还要送对方一子？" — then the game shows why that's the point.

## Storyboard (120 BPM, a beat = 0.5 s; every cut on a beat)

| # | Beats | Time | Scene | Copy |
| --- | --- | --- | --- | --- |
| 1 Hook | 0–6 | 0.0–3.0 | Giant type, word by word on the beat; a white stone drops into the question mark's place | 下棋， / 还要送对方一子？ |
| 2 Reveal | 6–12 | 3.0–6.0 | 赠岛 written in stones on the home-page title board | 赠岛 · Gift Islands |
| 3 Rule | 12–21 | 6.0–10.5 | 7×7 board; one move per beat, the gift stone flies out of the player's own stone | 每一手，一枚给自己，一枚送对方。 |
| 4 Twist | 21–31 | 10.5–15.5 | White's three islands; the gift lands in the gap; a giant 3 → 2 slams in | 送对位置，对方反而少一座岛。 |
| 5 Outro | 31–40 | 15.5–20.0 | 岛多的一方获胜。then the site's blue button with the address | 开始对局 · giftislands.top |

## Identity

Dark theme of the site: `#000` ground, `#F5F5F7` ink, sea `#2E363D`, accent `#0A84FF`; PingFang SC Semibold.
Bigger and louder than the main film: hook type at 150 px, the 3 → 2 at 260 px, faster cuts.

## Sound

120 BPM, F major: a soft kick on every beat from the reveal, an off-beat shaker, a round sine bass
on the bar, and a mallet pluck on every stone (same instrument as the main film so the two can be
compared on picture, not on timbre). Every hit on the same beat grid from frame 0; a riser into the
3 → 2 and a final chord under the button.
