# 赠岛后端

四个棋力等级的赠岛模型及其 CPU 推理服务。前端只需通过 HTTP 发送 JSON，协议见 [../docs/API.md](../docs/API.md)。

以下命令都在 `backend/` 目录下运行。

## 安装

需要 Python 3.14 和支持 OpenMP 的 C++17 编译器（例如 `g++`），以及对应的 Python 开发头文件。

```bash
bash scripts/bootstrap.sh      # 创建 .venv，按 requirements-lock.txt 安装 CPU 版 PyTorch 等依赖
bash scripts/build_native.sh   # 编译 cpp/search.cpp，生成 giftisland/_search*.so
.venv/bin/python -m pytest -q
```

`bootstrap.sh` 默认使用 `python3`，可用 `PYTHON_BIN=/path/to/python3.14` 指定解释器。

## 启动与停止

```bash
bash start.sh
bash status.sh
bash stop.sh
```

默认地址 <http://127.0.0.1:8765>，交互式接口文档 <http://127.0.0.1:8765/docs>。

服务在后台运行，关闭终端不会结束服务；日志在 `.runtime/server.log`。重复启动不会创建重复服务；停止脚本会核对进程身份，只停止本项目的进程。

冒烟测试（需先启动服务）：

```bash
.venv/bin/python scripts/smoke_http.py   # 报告写入 .runtime/http-smoke.json
```

## 四级模型

| API level | 名称 | 训练步数 | 文件 |
|---|---|---:|---|
| `level1` | 入门 | 501 | `models/level1.pt` |
| `level2` | 初级 | 3500 | `models/level2.pt` |
| `level3` | 进阶 | 7000 | `models/level3.pt` |
| `best` | 最强 | 521500 | `models/best.pt` |

`models/models.json` 记录各模型的 SHA-256，启动时逐个校验。四级棋力顺序经过双方每手 512 次模拟、每组 1000 局的对战验证。服务默认每手 128 次模拟、不做对称集成，以保证交互速度；这一默认设置没有重新验证四级棋力顺序。请求可选择 512 次模拟和 `ensemble`，代价是更长的计算时间。

## 接口概要

棋盘固定 9×9，按行展开为 81 个整数：`0` 空、`1` 黑、`2` 白。坐标为从 0 开始的 `[row, col]`。每一手同时在两个不同空格分别放当前玩家和对方的棋子，黑先，黑白棋子数始终相同。

后端不保存棋局：前端保存每次返回的 `position`，下次请求提交其 `board` 和 `player`。`requested_position_key` 可用来识别迟到的旧请求结果。

| 请求 | 用途 |
|---|---|
| `GET /healthz` | 健康检查与引擎忙碌状态 |
| `GET /api/v1/models` | 模型等级、版本、搜索设置范围 |
| `GET /api/v1/rules` | 编码和规则说明 |
| `POST /api/v1/positions/validate` | 检查棋盘、行动者与当前分数 |
| `POST /api/v1/play-move` | 提交人类的一对落点，返回下一局面 |
| `POST /api/v1/ai-move` | AI 出招并返回下一局面 |

空棋盘让 best 执黑出一手：

```bash
curl --fail-with-body http://127.0.0.1:8765/api/v1/ai-move \
  -H 'Content-Type: application/json' \
  -d '{"level":"best","simulations":128,"seed":42}'
```

人类执黑的一手：

```bash
curl --fail-with-body http://127.0.0.1:8765/api/v1/play-move \
  -H 'Content-Type: application/json' \
  -d '{"self_point":[4,4],"opponent_point":[0,0]}'
```

省略 `board` 表示空棋盘；省略 `player` 时后端按已完成手数推导行动者。AI 请求支持 `level`、`simulations`、`symmetry`（`none` / `random` / `ensemble`）和可选的 `seed`。

`search.signed_value` 是当前行动者视角的胜概率减负概率，**不是胜率**。`position.scores` 为两色当前的连通块数量；只有 `terminal=true` 时 `result` 才是最终胜负。

## 并发和超时

CPU 推理串行运行，健康检查和规则请求不需要等待推理。计算期间新的 AI 请求返回 `503 engine_busy` 和 `Retry-After: 1`；前端应禁用重复提交，或稍后重试。等待超过上限返回 `504`，但当前计算仍会完成并释放引擎，不会因为客户端超时而并发使用同一引擎。接口不保存棋局状态，超时不会改变前端保存的棋盘。

请求参数错误返回 422；向已终局的局面请求落子返回 409。不要把 AI 返回的旧局面覆盖到用户已经继续操作的棋盘上。

## 配置

复制 `.env.example` 为 `.env` 后修改，再重启服务：

```bash
cp .env.example .env
bash stop.sh
bash start.sh
```

| 变量 | 默认值 | 说明 |
|---|---|---|
| `GIFTISLANDS_HOST` / `GIFTISLANDS_PORT` | `127.0.0.1` / `8765` | 监听地址 |
| `GIFTISLANDS_TORCH_THREADS` | `2` | PyTorch 线程数 |
| `GIFTISLANDS_SEARCH_THREADS` | `1` | 原生搜索线程数 |
| `GIFTISLANDS_DEFAULT_SIMULATIONS` | `128` | 默认每手模拟次数 |
| `GIFTISLANDS_MAX_SIMULATIONS` | `512` | 单次请求上限（最大 2048） |
| `GIFTISLANDS_SYMMETRY` | `none` | 默认对称模式 |
| `GIFTISLANDS_REQUEST_TIMEOUT` | `120` | HTTP 等待上限（秒） |
| `GIFTISLANDS_CORS_ORIGINS` | 空 | 额外允许的精确 Origin，逗号分隔 |

默认允许任意端口的 `localhost` / `127.0.0.1` / `[::1]` 前端跨域。线上部署时，建议用反向代理把前端和 `/api/v1/*` 放在同一个 HTTPS 域名下，这样不需要跨域配置。

## 代码结构

- `giftisland/`：规则、神经网络与 PUCT 搜索；`cpp/` 是搜索核心的原生实现。
- `giftislands_backend/`：FastAPI 封装，负责输入校验、模型加载和推理调度。
- `scripts/`：`bootstrap.sh` 安装依赖，`build_native.sh` 编译扩展，`manage.py` 实现启停，`smoke_http.py` 是端到端冒烟测试。
