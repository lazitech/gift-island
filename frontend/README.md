# 赠岛前端

对弈网页，原生 HTML/CSS/ES module，无需构建。

## 本地运行

先启动后端（见 [../backend/README.md](../backend/README.md)），再在仓库根目录运行：

```bash
bash frontend/serve.sh   # http://127.0.0.1:5173，可用 PORT=xxxx 换端口
```

`serve.sh` 给所有响应加上 `Cache-Control: no-cache`，修改文件后刷新即可看到效果。

## 功能

- **首页**：标题“赠岛”由黑白棋子按笔顺拼成，同时也是一局棋。你执黑，和浏览器端一个刻意不太强的 AI（`title-ai.js`）各下八手，新增岛多者胜；赢了会打开彩蛋页（`#/egg`）。
- **对局**（`#/play`）：对手可选四级 AI 或双人同屏，可执黑或执白；AI 思考分快、标准、深入三档，对应每手 128 / 256 / 512 次模拟。
- **教学**（`#/learn`）：五课交互式规则教学。
- 棋局保存在浏览器本地，刷新后继续。支持悔棋（⌘Z / Ctrl+Z）、方向键加空格落子、Esc 取消已选的落点。

## 后端地址

- 在 `localhost` / `127.0.0.1` 打开时，默认连接 `http://127.0.0.1:8765`。
- 在其他域名下打开时，默认请求同源的 `/api/v1/*`。
- 两种情况都可以用 `?api=<后端地址>` 改写。

## 部署

把本目录的 `index.html`、`style.css` 和 `*.js` 作为静态文件发布，并在同一域名下把 `/api/v1/*` 反向代理到后端。下面是 Caddy 的例子：

```
example.com {
	handle /api/v1/* {
		reverse_proxy 127.0.0.1:8765
	}
	handle {
		root * /srv/gift-island
		header Cache-Control "no-cache"
		file_server
	}
}
```

## 文件

| 文件 | 作用 |
|---|---|
| `index.html`、`style.css` | 页面结构与样式 |
| `app.js` | 入口：路由、对局流程、设置与存档 |
| `client.js` | 后端 API 客户端 |
| `rules.js` | 浏览器端的岛与计分规则（与 `backend/giftisland/game.py` 一致） |
| `board-view.js` | SVG 棋盘与指针、键盘输入，对局、首页和教学共用 |
| `home.js`、`glyphs.js`、`title-ai.js` | 首页棋子标题及其对弈 AI |
| `learn.js` | 规则教学 |
| `egg.js`、`seal.js` | 彩蛋页与岛主印 |
| `tally.js` | 双方岛数显示，含落子前的 +1 / −1 预览 |
