# 赠岛 Gift Islands

一种新的双人棋类游戏：每一手同时落两枚子，一枚给自己，一枚送给对方。相连的同色棋子是一座岛，棋盘只剩一个空格时，岛多的一方获胜。

本仓库包含对弈网页和 AI 推理服务。AI 由神经网络加 PUCT 搜索驱动，有四个棋力等级。

在线试玩：<https://game.anzhelyu.com>

## 规则

- 9×9 棋盘，黑方先手，双方交替行动。
- 每一手选两个不同的空格：一个放自己的棋子，另一个放对方的棋子。棋子落下后不移动、不提走。
- 上下左右相连的同色棋子组成一座岛。每座岛计一分，大小不影响得分。
- 只剩一个空格时终局（共 40 手），岛多者胜，相同为和棋。

形式化定义见 [docs/rules.md](docs/rules.md)。

## 目录结构

```
frontend/                 对弈网页（原生 HTML/CSS/ES module，无需构建）
backend/                  AI 推理服务
  giftisland/             规则、神经网络与 PUCT 搜索
  giftislands_backend/    HTTP API（FastAPI）
  cpp/                    原生搜索扩展源码（pybind11 + OpenMP）
  models/                 四级模型与 SHA-256 清单
  scripts/                安装、编译、启停与冒烟测试
  tests/                  pytest 测试
docs/                     规则与 API 文档
```

前后端只通过 HTTP JSON 通信，后端不保存棋局，前端每次提交完整棋盘。

## 本地运行

需要 Linux、Python 3.14 和支持 OpenMP 的 C++17 编译器。x86_64 与 aarch64 均已验证。

```bash
# 后端：首次运行先安装依赖、编译原生扩展
cd backend
bash scripts/bootstrap.sh
bash scripts/build_native.sh
bash start.sh            # http://127.0.0.1:8765

# 前端：另开一个终端，在仓库根目录运行
bash frontend/serve.sh   # http://127.0.0.1:5173
```

浏览器打开 <http://127.0.0.1:5173>。停止后端用 `bash backend/stop.sh`。

## 文档

- [backend/README.md](backend/README.md)：后端启动、配置、模型与并发
- [frontend/README.md](frontend/README.md)：网页功能与部署
- [docs/API.md](docs/API.md)：HTTP API 协议；[docs/openapi.json](docs/openapi.json) 为 OpenAPI 描述
- [docs/rules.md](docs/rules.md)：规则的形式化定义
