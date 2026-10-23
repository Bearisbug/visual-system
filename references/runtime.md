# 运行能力与接续

<a id="bd-runtime-001"></a>
## BD-RUNTIME-001 · 按产物选择执行能力

- 触发：开始使用本 Skill、换执行环境，或把未完成的品牌工作交给另一 Agent。
- 规则：按本次产物核对下表所需能力，只检查将要使用的部分。工具名称是当前环境的实现选择；用户授权、运行时限制与项目规则优先。不假设特定 MCP、插件、联网、账号或相邻技能已安装。缺少能力时继续可独立完成的部分，并区分「本阶段已完成」与「后续待验证」；不得通过改名产物、手填通过状态或虚构工具调用来绕过缺项。
- 产物：在当前工作记录中写明实际工具、完成范围、未完成项与下一步；需要接续时采用下文的交接字段，不另建重复参数源。
- 验证：每项通过结论有本环境的实际证据，或明确引用仍有效的既有证据及版本。只有文档推理时不能声称已经看图、试排、渲染、计算对比度或验证目标平台。验证状态继续按 [BD-QA-001](assets.md#bd-qa-001)管理。

### 能力与边界

| 本轮产物 | 需要的能力 | 能力不足时如何继续 |
| --- | --- | --- |
| 简报、方向比较、风格候选、静态交接说明 | 读取文字、写出文本；无文件写入能力时可在对话交付正文并注明未落盘 | 从文档建立设计假设，列出要看的参考与待试参数；不要求生图、浏览器或脚本先通过 |
| 参考提取、视觉评审 | 实际查看本地或远程图像 | 只能引用已有文字记录并标为「文档记载，未独立目检」；不得把它写成当前观察。联网不可用时可研究可读取的本地素材，远端现状未核验 |
| 新位图探索、材质编辑 | 当前可用且获准的图像工具 | 精确几何任务可走可编辑矢量流程；位图 / 材质需求缺工具时交付已完成的简报、Prompt 与输入清单，图像生成保持待执行。按运行时规定选择工具，不臆造参考图参数 |
| SVG 母版、PNG 或物料导出 | 可编辑源处理、相应格式的渲染或导出工具，以及实际图像观察。SVG 栅格化用 `rsvg-convert` 或浏览器：ImageMagick 内置的 SVG 渲染器会漏画描边和样式，`magick` 只用来读写 PNG，不用来渲染 SVG。导出后把 PNG 与浏览器里的 SVG 放到同一尺寸并排看，记录用了哪个渲染器 | 可完成源文件或构造说明；缺渲染时列为未验收源稿，不能声称 PNG 已生成、透明度或小尺寸已通过 |
| 正式 release / tokens 机械验收 | 本包脚本声明的运行依赖，见下表 | 可完成不依赖脚本的源文件与说明；未运行的合同项保持 `not_run`。手工检查可另附记录，不能替代脚本并宣称脚本通过 |
| Web / 原生 / 设计工具交接的实际消费 | 对应目标的真实运行或导入环境 | 完成静态映射与交接说明，目标消费保持未验证；不能用 Web 截图证明原生平台或设计工具已接入 |

### 脚本入口

以下路径相对 Skill 根目录；调用前解析真实目录，参数路径含空格时按所用 shell 正确引用。仓库 Python 环境规则优先，Python 必须在虚拟环境中执行。

| 用途 | 入口与依赖 |
| --- | --- |
| 维护 Skill 资源 | `node scripts/check-skill.mjs`；Node.js 20+、`xmllint`；`--deep` 另需 ImageMagick 7 的 `magick`。`check.sh` 是 POSIX shell 包装入口；普通设计任务不要求运行此门 |
| 正式资产 release | `node scripts/validate-release.mjs <manifest.json>`；Node.js、`xmllint`、`magick`，实际合同见 [交付校验](validation-contract.md) |
| tokens 生成与检查 | 按 [BD-TOKEN-001](system.md#bd-token-001)调用内置 vendor 与检查器；需要 Node.js、uv 和 Python 虚拟环境。只交静态说明的任务不冒充完整 tokens 交付 |
| 物料版面测量 | `node scripts/check-application.mjs <build-dir> [--out <dir>]`；Node.js 22+（用内置 WebSocket 驱动 CDP，不装 npm 包）与一个 Chromium 系浏览器。这是无人值守的无头测量，按 `VISUAL_SYSTEM_BROWSER` 指定的可执行文件 → Playwright 缓存里的 chromium-headless-shell → Google Chrome / Chromium → Microsoft Edge 的顺序查找，只启动一次；交互目检仍按 BD-QA-001。证据默认写入 `<build-dir>/qa/application-check.json`，绑定 build.json 与每个输出的 SHA-256，记录实际浏览器与版本，build.json 的 `validation` 保持 `not_run`。Node 低于 22 或找不到浏览器时结果为 `not_run` 并写明原因（退出码 2），版面容量记为未验证，不改用目测宣称放得下 |

优先复用当前环境已提供的等效查看、渲染与浏览器能力。本机浏览器验证按 [BD-QA-001](assets.md#bd-qa-001)优先 Edge；确认不可用时选实际可用的浏览器并记录差异。浏览器工具并不统一提供 PNG 导出、字体检查或脚本执行，使用前核对接口。

本 Skill 内的规则、库、脚本与 vendor 通过相对路径读取。提到 ui-constraints、mobile-ui-constraints、theme-extract、style-templates 或 code-video 表示职责边界：有相应技能时按其入口承接；没有时写明交付对象和验收要求，由当前可用工作流承接，不伪称加载了不存在的技能。执行本包已有 tokens 生成器不需要另装 theme-extract；维护 vendor 时遵循维护规则。

### 给下一执行者的记录

在已有 brief / selection / delivery 记录内补齐：任务与本阶段范围、当前方向 ID / 版本、已确认选择与授权、输入及产物路径、所选风格包和参考角色、实际验证及未测项、下一动作与阻碍。路径相对交付根目录，工具专用会话 ID 不作为唯一入口。保留可编辑源与完整 Prompt；新 Agent 先核对真实文件和版本，再继续未完成步骤，不因换 Agent 重做已定方向。
