# 终末地剧情终端（Endfield Terminal）

一个在浏览器里运行的《明日方舟：终末地》剧情资料库终端：提问、看带编号的
原文、再读一句结论。也可由宿主页面嵌进窗口。

实作是 TypeScript + Preact：文章产生器、资料库守卫与终端自身的流程都有单元
测试；浏览器测试以替身桌面驱动真实页面，包含在命令列里的中文输入法组合。

## 截图

在 AI System 6 桌面里实际运行时截取，左为 Classic，右为 Liquid Glass。

<p><img src="screenshots/endfieldTerminal-classic.png" width="49%" alt="Endfield Terminal · Classic"> <img src="screenshots/endfieldTerminal-liquid-glass.png" width="49%" alt="Endfield Terminal · Liquid Glass"></p>

## 单独打开

```bash
npm ci
npm run dev
```

然后打开 `http://localhost:5173/terminal/index.html`。

单独打开时没有宿主桌面。每一个 `endfield.*` 服务都会应答 `unavailable`，
终端显示既有的错误卡片。除此以外界面不变。

## 真实部署

宿主桌面需要提供这些 bridge 服务（能力 `services`），并接受
`context.publish`（能力 `context`）：

| 服务 | 作用 |
| --- | --- |
| `endfield.search` | 空参数 → 页眉用的资料库 meta；有 body → 语料检索 |
| `endfield.ask` | `{ query, progress }` → 可渲染的回答对象（`query`、`answer`、截到 14 条的 `results`、`meta`、`ai_system6_metrics` 等），或 `{ ok: false, reason }` |
| `endfield.answer` | 留给以后用；本页不调用 |

剧情系统提示词留在宿主一侧。嵌进框架的页面从不读取供应商、模型路由、
凭证、密钥、base URL 或 endpoint。

宿主还需要：

- 用 `intent.dispatch` 把 `clip` 送到文件软盘、把 `ask` 送到 SideAsk
- 桌面发起的 `welcome.launch` / `launch.changed`，带 `{ evidence: n }`，以便
  引用打开并滚到、聚焦 `#endfield-evidence-n`
- 用 `publishedContext("endfieldTerminal")` 读 SideAsk / ClioTalk 的 grounding
  （`kind: "endfield"`，值为 `{ query, answer, results }`）

## 检查

```bash
npm run check       # 型别（strict）、Biome、单元测试、建置
npm run test:e2e    # 在 Chromium 里跑建置后的页面，含接桌面与不接桌面两种
```

## 构建

```bash
npm run build
```

把宿主页面要嵌入的文件写进 `dist/`：清单指名的页面（`terminal/index.html`）、
它旁边的 kit 文件、一份样式表、一份模块包，以及样式表指名的背景与字型。

## 目录

| 路径 | 内容 |
| --- | --- |
| `terminal/index.html` | 清单指名的页面；建置时改写它的模块与样式链接 |
| `src/app/` | 终端状态与流程：提问、回答、剪贴与菜单 |
| `src/bridge/` | 带型别的 bridge 客户端：服务与取消、context、intents、状态 |
| `src/data/` | 资料库型别与守卫、进度顺序、提问清单 |
| `src/view/` | 文章产生器：欢迎、检索中、带出处的回答、结论、剪贴档 |
| `src/ui/` | Preact 窗口：状态列、侧栏、终端与命令列 |
| `src/styles/` | 基础样式与终端样式表，都由 1.0.1 原样搬来 |
| `src/assets/` | 背景 SVG 与 Barlow Condensed 拉丁子集 |
| `public/` | `ais6-bridge.js`、`kit.css`、`app.manifest.json`，复制到建置根目录 |
| `tools/probe.mjs`、`tools/host-stub.mjs`、`tools/compare.mjs` | 对照探针、它的替身桌面与差异输出 |
| `tests/unit/`、`tests/e2e/` | Vitest、Playwright |

## 许可

代码为 MIT。见 [LICENSE](LICENSE)。主题与背景经授权使用，**不在** MIT
之下——见 [LICENSES.md](LICENSES.md)。

English: [README.md](README.md).

## 变更纪录

### 1.1.0 — 2026-11-22

- 改成 TypeScript + Preact，strict `tsc` 与 Biome 干净。窗口、文字、菜单动词、
  bridge 讯息、储存键（`recent`，含它仍会迁移的搬家前默认提问清单）与 `dist`
  行为都不变。旧运行时用 `translateWithin` 扫的 `data-i18n*` 属性不再存在：
  文字改由带型别的字表产生，它们原本产生的文字、标签与占位字完全一样。
- 语言切换影响的范围不变：窗口外壳换语言，已画在画面上的回答保持它被画出时
  的语言。
