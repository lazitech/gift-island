# 赠岛后端 API

默认服务地址是 `http://127.0.0.1:8765`。接口无会话状态，网页端每次提交完整棋盘。

## 棋盘和落子

棋盘是按行展开的 81 个整数数组：`0` 为空、`1` 为黑、`2` 为白。坐标使用从 0 开始的 `[row, column]`。黑方先手，每手同时落两个不同的空格：`self_point` 放当前玩家，`opponent_point` 放另一方。完成一手后 `player` 自动切换。

终局在只剩一个空格时出现。得分是同色四邻域连通块数量，`scores.black` 和 `scores.white` 分别是双方得分。

## 路由

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| `GET` | `/healthz` 或 `/api/v1/health` | 健康状态、CPU 设备和忙碌状态 |
| `GET` | `/api/v1/models` | 四个模型及验证信息 |
| `GET` | `/api/v1/rules` | 规则和编码说明 |
| `POST` | `/api/v1/positions/validate` | 校验位置并返回规范化位置 |
| `POST` | `/api/v1/play-move` | 应用网页指定的双落子 |
| `POST` | `/api/v1/ai-move` | 用指定模型搜索并应用一手 |

### `POST /api/v1/positions/validate`

请求结构（下面的 `board` 为 81 个整数；示例中的字符串只是文档占位符，不能直接提交）：

```json
{"board": [0, 0, 0, "...共81个元素..."], "player": 1}
```

实际 9×9 请求必须包含 81 个元素。`player` 可以省略，后端会按黑子数量奇偶推导；提供时必须与局面一致。

成功响应包含：

```json
{
  "board": [0, 0, 0, "...共81个元素..."],
  "player": 1,
  "move_number": 0,
  "empty_count": 81,
  "terminal": false,
  "scores": {"black": 0, "white": 0},
  "result": "ongoing",
  "position_key": "..."
}
```

`result` 的取值为 `ongoing`、`black_win`、`white_win` 或 `draw`。

### `POST /api/v1/play-move`

请求在位置字段之外增加两个落点：

```json
{
  "board": [0, 0, 0, "...共81个元素..."],
  "player": 1,
  "self_point": [0, 0],
  "opponent_point": [0, 1]
}
```

成功响应包含 `requested_position_key`、已应用的 `move` 和下一局面的 `position`：

```json
{
  "move": {
    "player": 1,
    "action_index": 1,
    "self_point": [0, 0],
    "opponent_point": [0, 1]
  },
  "position": {"player": 2, "empty_count": 79, "terminal": false}
}
```

### `POST /api/v1/ai-move`

请求字段：

```json
{
  "board": [0, 0, 0, "...共81个元素..."],
  "player": 1,
  "level": "best",
  "simulations": 128,
  "symmetry": "none",
  "seed": 123
}
```

`level` 为 `level1`、`level2`、`level3` 或 `best`；`symmetry` 为 `none`、`random` 或 `ensemble`。`simulations` 至少为 1，且不能超过服务配置的 `max_simulations`（默认 512）。默认使用 `best`、128 simulations、`none` 对称模式。

响应在 `play-move` 响应基础上增加：

```json
{
  "model": {"level": "best", "label": "最强已验证", "step": 521500, "sha256": "..."},
  "search": {
    "simulations": 128,
    "symmetry": "none",
    "seed": 123,
    "signed_value": 0.12,
    "elapsed_ms": 42.1,
    "exact_endgame": 5
  }
}
```

`search.simulations` 是实际完成的搜索次数。`signed_value` 是当前行动者视角的胜概率减负概率，范围 `[-1,1]`，不是胜率。

## 错误和取消

错误响应统一为 `{"detail": {"code": "...", "message": "..."}}`，常见状态码如下：

- `422 invalid_position`：棋盘、轮次或落点非法；预算超过配置上限也返回 422，代码为 `search_budget_exceeded`。
- `409 game_finished`：请求在已经终局的位置继续落子。
- `503 engine_busy`：唯一 CPU 推理槽正在工作，请稍后重试；响应带 `Retry-After: 1`。
- `504 inference_timeout`：达到 HTTP 等待上限。后台任务仍会完成，推理槽释放后再重试。
- `500 inference_failed`：后端推理异常。

浏览器取消 `fetch` 时应传入 `AbortSignal`；取消只终止网页等待，不会中断已经提交给原生搜索的后台任务。

## 前端 ES module

[`frontend/client.js`](../frontend/client.js) 提供 `getModels`、`validatePosition`、`playMove`、`aiMove` 和 `createGiftIslandsClient`。每个请求函数第二个参数可传 `baseUrl`、`signal`、自定义 `headers` 或测试用 `fetchImpl`：

```js
import { createGiftIslandsClient } from "./client.js";

const api = createGiftIslandsClient({ baseUrl: "http://127.0.0.1:8765" });
const models = await api.getModels();
const result = await api.aiMove(
  { board: Array(81).fill(0), player: 1, level: "best", simulations: 128 },
  { signal: controller.signal },
);
```

非 2xx 响应会抛出 `GiftIslandsApiError`，可读取 `status`、`code` 和 `detail`；用户主动取消时会原样抛出浏览器的 `AbortError`。

默认 CORS 允许 `localhost`、`127.0.0.1` 和 `[::1]` 的 HTTP/HTTPS 任意端口。部署网页到其他来源时，通过 `GIFTISLANDS_CORS_ORIGINS` 增加精确来源。
