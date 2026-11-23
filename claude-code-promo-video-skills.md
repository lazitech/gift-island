# Claude Code 宣传片 Skill 选型调研报告

2026-11-22

## 摘要

给新应用做宣传片，默认推荐 HeyGen 官方的 [product-launch-video](https://claudemarketplaces.com/skills/heygen-com/hyperframes/product-launch-video)（HyperFrames）。它是官方维护的，协议是 Apache-2.0，可以免费商用；会先出分镜和文案，确认后再渲染，方向可控。

要最快出一条社交短片，选 [brag](https://github.com/latent-spaces/brag)。应用是 React 写的、想用真实组件，选 [product-film-skill](https://github.com/Rieranthony/product-film-skill) 或 [Remotion 官方 skill](https://skills.sh/remotion-dev/skills)。追求电影质感，选 [cinetic](https://github.com/Leonxlnx/cinetic)。各场景的详细对照见下文「分场景推荐」。

## 两大底层框架

几乎所有宣传片 skill 都建在 HyperFrames 或 Remotion 之上。社区 skill 的作用是在框架外加一层"导演"流程：文案、分镜、配乐、质检。

| 框架 | 写法 | 维护方 | 协议 | 认可度 | 更适合 |
| --- | --- | --- | --- | --- | --- |
| [HyperFrames](https://skills.sh/heygen-com/hyperframes) | HTML + CSS + GSAP，渲染为 MP4 | HeyGen | Apache-2.0 | 约 84.6k star；54 个 skill 累计 18.1M 安装 | 不依赖前端技术栈，任何应用都能用；商用无授权费 |
| [Remotion](https://skills.sh/remotion-dev/skills) | React 组件，按帧计算 | Remotion 团队 | Remotion 许可：超过 3 人的公司需付费 | 约 73k star；`remotion-best-practices` 890K 安装 | React 项目，可直接复用产品组件；适合把视频当工程长期维护 |

star 数来自 [Motionboard 的汇总文章](https://motionboard.app/guides/claude-code-video-skills/)，安装数是 2026-11-22 在 skills.sh 上直接查到的。

## 候选 skill

官方两家的安装量远高于社区项目。社区里 brag 的 star 最多（22k），其余在几十到一千多。

| Skill | 框架 | 认可度 | 协议 | 产出与流程 | 优点 | 不足 |
| --- | --- | --- | --- | --- | --- | --- |
| [product-launch-video](https://claudemarketplaces.com/skills/heygen-com/hyperframes/product-launch-video)（HeyGen 官方） | HyperFrames | 540K 安装 | Apache-2.0 | 抓产品截图、读品牌 → `STORYBOARD.md` + `SCRIPT.md` → 逐帧 HTML → `video.mp4` | 官方维护、流程完整、分镜可先审 | 步骤多，出片比 brag 慢 |
| [Remotion 官方 skill](https://skills.sh/remotion-dev/skills)（13 个） | Remotion | `remotion-best-practices` 890K 安装 | Remotion 许可 | `/remotion-create` 生成工程，Studio 预览，渲染 MP4 | 教程最多，能并入现有 React 代码 | 只给编码规则，不带导演流程；大公司要付费 |
| [brag](https://github.com/latent-spaces/brag) | HyperFrames（Opus 5.5 下自动用精简版） | 22k star；24.4K 安装 | MIT | `/brag` 一条命令出约 20 秒短片，带配乐和分享文案 | 最快、社区最火 | 可控性低，偏短片 |
| [cinetic](https://github.com/Leonxlnx/cinetic) | Remotion（可切 HyperFrames） | 1.3k star | MIT | 文案自检 → 选模板（发布片、更新视频、UI 演示、社交广告等）→ 配乐音效 → 质量检查 | 电影质感、质检最严 | 环境依赖多（Node 22、ffmpeg 6、Python 3.11、Chromium） |
| [product-film-skill](https://github.com/Rieranthony/product-film-skill) | Remotion | 427 star | MIT | 先读设计系统写 `BRAND.md` → 问答 → 按节拍剪音乐 → 240fps 动态模糊成片 | 用产品真实组件，风格最贴产品 | 需要 React 项目；受 Remotion 许可约束 |
| [Barty-Bart/motion-graphics](https://github.com/Barty-Bart/motion-graphics)（6 个） | 未注明 | 1.3k star；17.7K 安装 | MIT | 12–20 秒快节奏宣传片、45–90 秒产品演示、音效 | 有中长篇产品演示模板 | 用的框架没写明 |
| [motionboard](https://github.com/krisyangdev/motionboard) | HyperFrames | 65 star | MIT | 38 种镜头（匹配剪辑、Logo 揭示等）按名调用，可拼成整片 | 能精确控制单个镜头 | 用户少 |

brag 和 motionboard 的 star 是直接看 GitHub 页面得到的，其余来自搜索结果摘要。

## 分场景推荐

先看三件事：要多快出片、应用是不是 React、公司是否超过 3 人（决定 Remotion 是否要付费）。

| 场景 | 推荐 | 备选 | 理由 |
| --- | --- | --- | --- |
| 新应用正式发布，30–45 秒官网或发布会片 | product-launch-video | cinetic | 分镜和文案先审再做，不容易跑偏；免费商用 |
| 发推特、朋友圈，当天就要，约 20 秒 | brag | product-launch-video | 一条 `/brag` 出片，自带配乐和分享文案 |
| 应用是 React，想让片子里就是真实界面和设计规范 | product-film-skill | Remotion 官方 skill | 直接复用组件和设计 token；先确认 Remotion 授权 |
| 追求 Apple 式电影质感，愿意多花时间 | cinetic | product-film-skill | 文案自检、镜头语言和质量检查最完整 |
| 版本更新视频（"v2 上线"，展示 2–4 个变化） | cinetic 的 `update` 模板 | product-launch-video | 专门为 15–23 秒的更新片设计 |
| 45–90 秒产品功能演示 | Barty-Bart 的 `explainer-default` | product-launch-video | 有专门的中长篇演示模板 |
| 只要某个镜头（Logo 揭示、匹配剪辑），或放进网站首页做动画 | motionboard | HyperFrames `motion-graphics` | 按镜头名调用，还能移植到网页 |
| 要长期维护一套视频模板，或批量生成 | Remotion 官方 skill | HyperFrames `general-video` | 视频就是代码工程，支持批量渲染 |

## 风险与注意事项

- **Remotion 授权**：个人、3 人及以下的公司、非营利组织免费，其他公司需要买公司授权。基于 Remotion 的 skill（product-film-skill、cinetic 默认模式）都受这条约束。
- **安装数有水分**：skills.sh 按单个 skill 计数，一次装整个仓库，每个 skill 都会加一。HyperFrames 的 18.1M 不代表独立用户数，只适合同一仓库内各 skill 之间比较。
- **汇总文章不中立**：Motionboard 那篇对比文章是它的作者写的，里面列入了自家 skill。本报告的安装数已在 skills.sh 上独立核对过。
- **第三方 skill 安全**：skill 可以让 agent 执行命令、读文件，安装前先看一遍它的 `SKILL.md` 和脚本。
- **素材版权**：配乐和字体要有使用权。cinetic 只用已授权的音乐，product-film-skill 要求你自己准备有版权的音乐。

## 上手步骤

1. 准备环境：Node.js 22 以上、FFmpeg（cinetic 还需要 Python 3.11 和 Chromium）。
2. 安装选定的 skill：
    - product-launch-video：`npx skills add heygen-com/hyperframes --skill product-launch-video`
    - brag：`npx skills add latent-spaces/brag`
    - cinetic：`npx skills add Leonxlnx/cinetic`
    - Remotion：先 `claude plugin marketplace add remotion-dev/claude-code-plugin`，再 `claude plugin install remotion@remotion`
3. 在应用仓库里打开 Claude Code，说清时长、画幅和投放渠道，例如"给这个应用做一个 30 秒横屏发布片"。
4. 先审分镜和文案，确认后再渲染。渲染完逐帧检查，提出修改意见后重新渲染。

## 来源

- [HyperFrames on skills.sh](https://skills.sh/heygen-com/hyperframes)
- [Remotion skills on skills.sh](https://skills.sh/remotion-dev/skills)
- [Remotion Claude Code plugin 文档](https://www.remotion.dev/docs/ai/claude-code-plugin)
- [latent-spaces/brag](https://github.com/latent-spaces/brag)
- [Leonxlnx/cinetic](https://github.com/Leonxlnx/cinetic)
- [Rieranthony/product-film-skill](https://github.com/Rieranthony/product-film-skill)
- [krisyangdev/motionboard](https://github.com/krisyangdev/motionboard)
- [Claude Code Video Skills: The 2026 List（Motionboard）](https://motionboard.app/guides/claude-code-video-skills/)
- [motif agent-skills 目录](https://createmotion.io/resources/agent-skills/)
