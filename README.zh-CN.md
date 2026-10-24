<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/assets/logo-dark.svg">
    <img src=".github/assets/logo.svg" alt="visual-system logo" width="120" height="120">
  </picture>
</p>

<h1 align="center">visual-system · 视觉系统</h1>

<p align="center">用于 Logo 设计、品牌语言、可编辑品牌物料和开发视觉交接的 Agent Skill。</p>

<p align="center"><a href="README.md">English</a> · <b>简体中文</b></p>

---

`visual-system` 约束 AI 编程 Agent 完成品牌设计工作：设计或迭代 Logo，从参考中提取视觉方法，验证字体，建立品牌语言与手册，制作可编辑的品牌物料，再把品牌参数以 tokens、字体配置和组件状态示例的形式交给开发。Agent 可以从新简报开始，也可以接着已有成果做，只执行你要求的阶段。

## 在不同 Agent 中开始

使用能读取中文说明的 Agent，直接通过文件工具打开 [SKILL.md](SKILL.md)，以其所在目录为 Skill 根目录，沿命中的任务路由继续，不依赖专用的 Skill 调用命令。科技、AI、SaaS 的方向研究可先看[风格选择表](libraries/styles/SELECT.md)，分别确定识别、传播物料与界面参数的用途。

[运行能力说明](references/runtime.md)按产物列出依赖。只有文字能力时可以完成简报与方向研究；看图、渲染、tokens 校验和平台接入需相应实际工具。缺项记明并交接当前文件与选择，不冒称通过。ui-constraints、code-video 等是按任务选用的相邻工作流，缺少它们不阻断可独立完成的品牌工作。这套约定支持迁移使用，不代表已在所有 Agent 或平台认证。

## 覆盖的任务

| 任务 | Agent 的入口 |
| --- | --- |
| 新 Logo、已有方向继续、方向比较与迭代 | [Logo 流程](references/flow-logo.md) |
| 按参考图或指定的视觉方法做 | [BD-REF-001](references/design.md#bd-ref-001) + [风格索引](libraries/styles/INDEX.md) |
| 字标、字体搭配、中英文排版 | [BD-TYPE-001](references/assets.md#bd-type-001) + [字体索引](libraries/fonts/INDEX.md) |
| 已有自有 Logo，只改配色或材质 | [BD-EDIT-001](references/design.md#bd-edit-001)、[BD-MATERIAL-001](references/design.md#bd-material-001) |
| SVG/PNG 母版、favicon 与基础资产交付 | [BD-MASTER-001](references/assets.md#bd-master-001) + [交付合同](references/validation-contract.md) |
| 品牌语言、品牌手册、辅助图形与真实物料 | [品牌系统流程](references/flow-system.md) + [应用模板库](libraries/applications/INDEX.md) |
| 同时服务宣传物料与产品界面的设计系统 tokens、图标 | [BD-TOKEN-001](references/system.md#bd-token-001)、[BD-ICON-001](references/system.md#bd-icon-001) |
| 开发视觉规范、tokens、字体与资产配置、组件状态 | [开发视觉交接流程](references/flow-handoff.md) + [Web 消费验证](references/handoff-web.md) |

业务需求、页面导航、API 与产品代码不在范围内，交给对应任务处理。

## 工作方式

每个方向、版本和改动都用稳定 ID 记录，同时保存完整 Prompt、每张参考图及其角色（构思、形状、材质、排版或应用）、输出路径和反馈。新方向必须在意象、轮廓或内部构造上有实质差异，换色或换背景不算新构思。

正式 Logo 要建立由真实路径构成的可编辑母版。位图嵌进 SVG 不算矢量化，生图结果也不能当作可信的矢量母版、正确文字或真实透明背景。所有导出都从这一份母版生成，光学校正版和材质版单独标注，承诺的每个文件都必须实际存在且可读。

机械检查、视觉目检和行为测试分开报告。小尺寸、单色与反白、深浅底、拼写和真实应用都在实际产物上核对，校验器通过不能报告成视觉通过。

直观看当前例图，打开[风格案例导航](libraries/styles/CASEBOOK.md)。各包原图档案保留品牌系统与应用观察，AI 重新演绎与原创研究分区展示；三例未生成与一例辅助图形替代均明确标记。

## 目录内容

```text
SKILL.md                 入口：任务路由与工作规则
references/              16 张规则卡（BD-*）、运行能力说明、流程与交付合同
libraries/styles/        12 类风格、152 张 AI 图（119 重绘＋33 原创）、122 源样本与3例阻碍
libraries/fonts/         Space Grotesk、Noto Sans SC、JetBrains Mono（OFL）及一组已测搭配
libraries/prompts/       Prompt 模式：新构思、轮廓细化、材质配色、字标、应用展示
libraries/applications/  公告 1200×630、竖版 1080×1350、封面 1600×900 模板及渲染器
scripts/                 Skill 自检、release manifest 校验、tokens 检查、tokens → brand.json、物料测量、自测、渲染器测试、样例页渲染器与验收
vendor/theme-extract/    tokens 生成器与 profile-2 格式文档的原样副本（SOURCE.json 记录上游提交与 SHA-256）
agents/openai.yaml       Codex 展示元数据
AGENTS.md                维护本 Skill 时的规则
```

每包有 `STYLE.md`、`EXAMPLES.md`、`PROMPTS.md`、`generated.json`、`REFERENCES.md` 和 `sources.json`，包含原创的包另有 `originals.json`。12 类、每类至少 10 张、共 152 张研究图按[简约艺术方向](libraries/styles/ART-DIRECTION.md)展示；原作、来源重绘与独立原创分别登记。包状态仍为 `provisional`：静态研究不等于真实品牌采用、完整迁移、字体、正式资产或产品集成通过。

| 风格包 | 方法 |
| --- | --- |
| `pixel-grid-identities` | 像素网格与离散图形；Mistral、MediaViz |
| `editorial-typographic-systems` | 编辑式字体与信息层级、手绘概念插画；Anthropic、Perplexity、Notion、Intercom |
| `modular-responsive-identities` | 可组合与可变识别；Cohere、Slack |
| `parametric-science-visuals` | 参数化科学图形；Secondmind、Covariant |
| `semantic-tech-marks` | 科技语义与字母融合 |
| `modern-product-wordmarks` | 现代产品字标 |
| `folded-ribbon-paths` | 折带与连续路径 |
| `geometric-letter-monograms` | 几何字母与组合 |
| `geometric-negative-space` | 几何负空间 |
| `monochrome-product-marks` | 黑白产品意象 |
| `modernist-corporate-symbols` | 现代主义企业符号 |
| `monoline-contour-marks` | 单线与轮廓图形 |

## 安装

仓库包含原始参考、生成示例与字体文件，建议浅克隆。

Claude Code 全局可用：

```sh
git clone --depth 1 https://github.com/Bearisbug/visual-system.git ~/.claude/skills/visual-system
```

只在单个项目中使用时，克隆到 `<项目>/.claude/skills/visual-system`。其他支持 `SKILL.md` 格式的 Agent，把目录放进该 Agent 的 skills 目录即可。

## 依赖

| 工具 | 用途 |
| --- | --- |
| Node.js 20+（`check-application` 需 22+） | `check.sh`、校验器、物料渲染器 |
| uv（Python 3，仅标准库） | 运行 vendor 的 tokens 生成器与 `check-tokens` |
| `xmllint` | 检查时解析 SVG |
| ImageMagick 7（`magick`） | `check.sh --deep`，以及 release 校验中的 PNG 与透明度检查 |
| `rsvg-convert` 或浏览器 | 把 SVG 母版栅格化为 PNG；ImageMagick 内置的 SVG 渲染器会漏画描边和样式 |
| Chromium 系浏览器 | `check-application` 逐槽测量与 1x PNG 导出（依次查找 Playwright 的 chromium-headless-shell、Chrome / Chromium、Edge）；预览模板，目检优先 Edge，不可用时记录实际浏览器 |
| 生图工具（可选） | 位图探索与材质研究；矢量母版直接用 SVG 构建 |

## 用法

直接用自然语言告诉 Agent，例如：

- 「用 visual-system 给研究者笔记应用 Tidepool 探索三个 Logo 方向。」
- 「方向 B v2 的造型不动，只试一版低饱和的绿色。」
- 「给选定的标志建 SVG 母版，导出 SVG、PNG 和 favicon。」
- 「把品牌手册转成网页项目的 design tokens 和字体配置，附按钮状态示例。」
- 「基于选定的 Logo 建一套完整设计系统，宣传图和前端都从这套 tokens 取值。」

## 校验

在 Skill 根目录执行：

```sh
./check.sh                                          # Skill 资源：链接、规则卡、catalog、来源、SHA-256
./check.sh --deep                                   # 额外解码位图
node scripts/validate-release.mjs /abs/path/to/release/manifest.json
node scripts/self-test.mjs --output /abs/path/to/validation-results.json
node --test scripts/test-application-renderer.mjs
node scripts/check-application.mjs /abs/path/to/application-output   # 没有浏览器时退出码 2（not_run）
node scripts/check-tokens.mjs /abs/path/to/brand --lint /abs/path/to/example.css
node scripts/specimen/render-specimen.mjs /abs/path/to/brand          # 读 brand/specimen.json
NODE_PATH=$(npm root -g) node scripts/specimen/check-specimen.mjs /abs/path/to/brand
```

每条命令输出 JSON，机械检查通过时退出码为 0。通过不代表视觉质量、原创性、字体加载或许可有效性已经验证。

## 许可

原创文本、脚本、模板与 Logo 采用 [MIT 许可](LICENSE)。随附字体（SIL OFL 1.1）、第三方参考与含第三方标志的 AI 重绘分别按声明处理，详见 [NOTICE](NOTICE.md)。权利人可以提交 issue，要求移除图片或更正署名。

Logo 把同一个圆角方形嵌套了三次，分别作字碗、字腔和强调色块，对应「一份母版，任何尺寸都成立」。
