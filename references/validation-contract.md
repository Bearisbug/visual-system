# 机械校验合同

本合同约束视觉系统 Skill 的资源清单与品牌 release manifest。执行命令前读取本文件；维护优先级沿用 [维护规则](../AGENTS.md)，品牌交付按 [Skill 入口](../SKILL.md) 执行。机械 PASS 只表示所列机器条件通过，不能证明视觉质量、相似性风险、授权有效性、字体加载或用户已选定。

## 命令与依赖

在 Skill 根目录执行：

```sh
./check.sh
./check.sh --deep
node scripts/validate-release.mjs /absolute/path/to/release/manifest.json
node scripts/self-test.mjs --output /absolute/path/to/validation-results.json
```

`check.sh` 默认扫描自身 Skill 根；维护夹具时可传 `--root /absolute/path/to/skill-copy`。命令向标准输出写 JSON，退出码 0 表示机械 PASS，1 表示 FAIL。不得以 `checks` 中的手写 pass 覆盖实际错误。

依赖 Node.js 20+ 与 `xmllint`（SVG XML 解析，禁止联网解析）。`--deep` 及 release 的 PNG 解码/透明度检查另需 ImageMagick 7 的 `magick`。缺依赖时报错，不能跳过后仍标 PASS。工具只读取目标文件；不联网、下载字体、调用生图、改写 manifest 或自动补 SHA。自测仅在系统临时目录创建自有夹具，结束后移除；只将最终报告保存到调用者指定路径。

## Skill 资源门

默认检查以下项目：

- `SKILL.md` 的 YAML 顶层 `name`、`description`；name 必须为 `visual-system`。`STYLE.md` 必须有 `id`、`name`、`version`、`status`，并与目录和来源清单一致。检查器只解析所需的顶层标量，不是完整 YAML 语法检查器。
- Markdown 代码围栏配对、代码围栏外的行内链接与引用式链接定义。相对路径以所在 Markdown 为基准，必须存在且真实路径留在 Skill 内；Markdown anchor 必须存在。外部 URL 不发请求；代码样例、普通反引号中的路径说明、HTML/CSS/JS 内的资源引用不属于此项。
- 规则以 `## BD-类别-三位数字 · 标题` 定义（类别为大写字母开头的大写字母/数字串），紧前一行必须有同名小写显式 HTML anchor。每卡必须有非空的“触发、规则、产物、验证”四个字段。catalog 每张卡登记一次，链接文本含 ID，链接指到唯一卡文件与 anchor。入口与 references 中使用的具体 BD ID 必须有定义。
- 风格数量从实际 STYLE 目录和 INDEX 链接推导，不固定包数。`sources.json` 的 `schema_version: 1`、style ID、asset/sample/group 唯一 ID、引用、真实 SHA-256、文件格式与尺寸必须一致。兼容 `members` / `sample_ids` 分组、独立 `overview`、截图原图和远程原图；preview 未单列尺寸时沿用原图尺寸。
- 默认展示按 `display_file → detail_file → asset.preview_file` 解析，必须能追到对应来源或增强输出。增强必须保留输入、输出、完整 Prompt 文件引用、工具与复核记录；包总览与全库总览不增加案例数。裁切检查坐标边界和已声明的裁切/留白尺寸，不宣称像素重建已验证。
- SHA 检查覆盖来源、preview、detail、增强及总览。默认读 PNG/JPEG/GIF/WebP/AVIF 头部与 SVG 画布；`--deep` 额外用解码器读取栅格第一帧与尺寸，不能替代逐例目检。AVIF 头部读取首个空间尺寸属性；多图、网格或动画文件需对实际第一帧以 `--deep` 核对。
- 字体清单位于 `libraries/fonts/sources.json`，采用 `schema_version: 1`、`fonts` 数组；每项含 `id`、`family`、`official_url`、`license_file`、`files:[{path,sha256,format}]`。路径相对 fonts 目录，校验文件、SHA 与 TTF/OTF/WOFF/WOFF2 签名；声明 license SHA 或 bytes 时也校验。字形覆盖、可变轴、许可解释和浏览器实际加载须另行验证。
- 发布文本不得含本机绝对路径：扫描 git 受跟踪文件与未被忽略的新文件（Skill 根不在 git 里时扫描整个目录），文本行中出现以 `/Users` 起头的目录路径或指向它的 `file://` 链接即报 `LOCAL_PATH`。浏览器采集等证据里的页面地址写成相对 Skill 根目录的路径，另记采集日期与浏览器版本。二进制文件不扫描，第三方原图内嵌的元数据保持原样。
- 应用库存在时检查 `libraries/applications/templates.json` 的 schema、唯一 ID、尺寸与 HTML 路径，入口/合同/渲染器是否存在、基本槽名及 brand.css 接入；逐项内容槽、资源选择与写入保护由 [应用渲染器](../libraries/applications/render.mjs)执行，其合同见 [应用数据](../libraries/applications/contract.md)。静态检查不解释完整 HTML/CSS 语义，不证明文字可见或版面合格；渲染器正反案例使用 `node --test scripts/test-application-renderer.mjs`。

## Release manifest v1

manifest 必须放在 release 根目录；所有文件路径、母版路径与检查证据路径均相对该目录。路径不得为绝对路径、URL 或指向目录外的符号链接。命令参数可为 manifest 的绝对路径。

必要顶层字段：

| 字段 | 合同 |
| --- | --- |
| `schema_version` | 数字 `1` |
| `brand` | 非空品牌名称字符串 |
| `version` | 非空版本字符串；选择状态另在工作记录说明 |
| `masters` | 非空数组；每项 `{path, kind: "vector"、"raster" 或 "html"}`；path 必须同时登记在 files；各类型范围见下文 |
| `files` | 非空数组；每项见下表；path 唯一 |
| `checks` | 非空对象；每项是 `{status, evidence?, reason?}` |

每个 `files` 条目：

| 字段 | 合同 |
| --- | --- |
| `path` | 包内现存文件相对路径，不能重复 |
| `role` | 非空用途名，如 `master`、`logo`、`favicon`、`application`、`font`、`license`、`reference`、`evidence` |
| `format` | 小写实际格式；SVG/PNG/JPEG/GIF/WebP/AVIF、字体格式按文件签名核对；其他文件至少核对扩展名与 SHA |
| `sha256` | 文件真实 SHA-256，小写 64 位十六进制 |
| `source_master` | 派生 SVG/PNG/JPEG/GIF/WebP/AVIF 必填，指到 masters 中已登记的母版；`reference`、`evidence` 和母版本身不要求。若填写，即使该格式不强制也必须能解析；直接指向 html 母版的条目只接受 PNG |
| `width`、`height` | 图像必填，数值 > 0，与实际尺寸一致；SVG 每一轴优先采用固有的数值/px width 或 height，该轴未指定可解析长度时采用 viewBox 对应宽高；不能在两者不同的情况下自行择一。其他文件不要填写 |
| `variant_kind` | 图像可填 `standard`（默认）、`optical`、`material`；材质图不能登记为 vector master |
| `variant_reason` | optical 必填，说明用途和相对母版的修正；必须同时有 source_master |
| `geometry_group` | 可选非空组名；仅用于 `standard` SVG，比较同组轮廓结构。至少两份文件才能证明跨文件一致 |
| `transparency` | PNG 可填 `required` 或 `opaque`；required 检查实际存在 alpha<1 像素且也存在 alpha>0 像素，opaque 检查全部像素不透明。未声明则仅报告透明度，不强制需要透明背景 |
| `license_file` | role 为 font 的文件必填，指到 files 中登记的许可文件 |

母版 `kind: vector` 只接受解析成功的 SVG，必须包含可编辑矢量绘制元素，禁止 `image`、脚本、foreignObject、外部引用和事件处理器；局部 URL 必须指到现存唯一 ID。仅把位图放进 SVG 不满足母版要求。`kind: raster` 必须是实际栅格图。所有类型的母版来源链都不能形成循环；允许合法多级来源。检查器不能证明母版的设计正确或图形可辨。

`kind: html` 用于含可编辑文字的固定画布品牌物料 PNG 排版源，文件条目使用 `role: master`、`format: html`、`.html` 路径与真实 SHA，不填写图像专用字段。它必须是可直接加载且正文含静态 HTML 文字的 UTF-8 文档，使用显式、完整、依次排列的 html/head/body 标签，在 head 内声明 UTF-8（meta charset 或 http-equiv Content-Type）。CSS、字体、Logo、许可等实际依赖分别登记；画布、编辑和导出方法写入使用说明。`source_master` 记录派生来源，不代替多文件依赖映射；直接由 HTML 派生的 PNG 可以继续作为已登记的 raster 母版。

HTML 母版检查使用有限文本扫描：严格 UTF-8 解码、上述外层结构与编码声明，以及去掉常见注释、脚本、样式、template、noscript、SVG/MathML 内容后的非空正文文字。图片 alt 和脚本字符串不算正文；单元素文字物料允许通过。只有登记为 html 母版的文件执行此检查，普通 HTML 文档按原有路径、扩展名与 SHA 处理。该扫描不是完整 HTML 解析器或依赖扫描器，不执行脚本、不解释 CSS；不能证明文字可见、所有内容不依赖脚本、完整可编辑性、资源加载、画布尺寸或 PNG 渲染来源。复杂嵌套、浏览器纠错与隐藏元素须由浏览器和目检核对，不能以静态 PASS 代替 [BD-QA-001](assets.md#bd-qa-001)。产品入口、脚本生成正文的空壳及只嵌压平成品的页面不属于此母版用途。

`geometry_group` 比较结构化 SVG 轮廓记录：保留 viewBox、路径、坐标、变换、笔画宽度、裁切及绘制顺序；忽略普通颜色值、渐变定义、元数据、ID 和外层输出宽高。同组应从同一母版导出。只有已经转轮廓、没有 CSS/style/class、text/tspan/use 依赖的自包含 SVG 可进组；复杂或数学等价但结构不同的 SVG 需先规范导出，不把校验器的字符串差异解释为视觉差异。`fill:none`、`stroke:none` 与可见颜色不等价；透明度保留。光学校正版和材质图不得进普通几何组，应分别记录来源、用途与视觉复核。此门不比较 PNG 和 SVG 的视觉轮廓，也不证明不同构图的横竖组合相同。

`checks` 的 status 为 `pass`、`fail`、`not_run`、`not_applicable` 之一。pass/fail 必须提供存在的包内 evidence 文件；not_run/not_applicable 必须写 reason。任何 fail 导致 release 门 FAIL；not_run 列入 warnings 并使 `ready_for_delivery:false`，即使机械项通过。检查器只验证证据可达，不推断截图内容或声明真伪。最终交付还须核对实际使用场景的视觉和行为证据。

未列入 files 的普通文件会列为 warning；源文件、字体、许可、应用与必要证据须由交付者主动登记。manifest 自身不登记自己的 SHA，以避免循环依赖。保留真实来源记录；机械脚本不自动替设计者批准定稿。
