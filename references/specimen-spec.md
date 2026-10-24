# 标准组件样例页（Specimen）规格 · v1.3

visual-system 按本规格交付 tokens（BD-TOKEN-001），并自带确定性渲染器与验收脚本（§8）：品牌目录写一份 `specimen.json`，运行渲染器生成样例页，再运行验收脚本出截图与检查报告。执行者不手搭样例页。

## 1. 定义

样例页是一张单独的页面，把一套设计系统的品牌基础、全部基础 token、基础组件的全部状态、页面模式与开发接入排在一起。组件与通用页面模式只用渲染器内置的中性示例文案（中文为主，字阶样本中英各一行），不读项目业务数据；品牌基础、本产品界面、物料与文件清单由品牌在 `specimen.json` 里提供片段（§8.2）。用途：

1. **定稿**：真实页面之前，把字阶、颜色、间距、圆角、层级、状态一次定下来并锁进 token；之后的页面只引用 token。
2. **评审**：所有视觉决定并排出现，层级是否拉开、状态是否可分、亮暗是否一致，逐节看完。
3. **基准**：真实页面做完后，当作相似度验收的对照基准。

规格与风格无关：套 Apple、Linear、Material 任一套 token，都应得到一张完整的样例页。样例页由 token 确定性渲染，同一输入逐字节同一输出，禁止由 LLM 逐次生成（结果不可复现，也违反 C1、C2）。

## 2. 基础 token 清单

样例页只能展示 token 里有的东西；下表是一套设计系统能被样例页完整展示的最低 token 集合。缺的类别在页面上显式标「缺」，禁止在样例页里用字面值补。

类别键与 token 格式 `design-extract/profile-2` 的 `meta.categories` 一致（theme-extract `tokens-schema.md` §10；visual-system 内的副本在 `vendor/theme-extract/references/tokens-schema.md`），每个类别在 token 里声明为 present / notApplicable / missing。

| 类别键 | 类别 | 必含字段 | 说明 |
|---|---|---|---|
| `typography` | 字阶 | 每档：key、角色、字号、行高、字距、字重；可选中文覆盖（行高、字距、字体族） | 档数随系统，Apple 约 11 档、Tailwind 默认 7 档。允许两档同字号只差字重 |
| `fontWeight` | 字重 | 本系统允许的字重集合 | Apple 文本样式只用 Regular / Semibold / Bold |
| `color` | 颜色角色 | 文字（主 / 次 / 弱）、表面（sunken / default / raised / overlay）、强调、强调上的文字、语义（成功 / 警告 / 错误）、分隔线、选中高亮 | 每个角色映射到一个 token 键，见 §6 映射表 |
| `space` | 间距 | 数值刻度；语义三级：组内 / 组间 / 区块 | |
| `radius` | 圆角 | 各档精确值；胶囊；内圆角下限 | 同心公式：内圆角 = max(外圆角 − 内边距, 下限) |
| `elevation` | 层级 | 表面色与阴影成对（sunken / default / raised / overlay） | 系统不用阴影时对应层的阴影标「不适用」并写理由；暗色下层级越高表面越亮 |
| `state` | 状态层 | hover / focus / pressed / dragged / disabled 的叠加透明度；焦点环（粗细、偏移、颜色） | 参考值：Material hover 0.08、focus 0.10、pressed 0.10、dragged 0.16、disabled 0.38 |
| `motion` | 动效 | 时长档、缓动档 | |
| `hairline` | 发丝线 | DPR 2 下取 0.5px 还是 1px | |
| `typographyDisplay` | 展示字阶（可选） | 同字阶，用于固定画布的宣传物料 | 与字阶共用字体族、字重集合与颜色角色；样例页只在 §4.1 另列一组 |
| `breakpoint` | 断点（可选） | 至少 390 与 1440 两档对应的布局差异 | |
| `zIndex` | z-index（可选） | z-index 刻度 | |
| `material` | 材质（可选） | 半透明表面的模糊与着色 | |
| `dataViz` | 数据可视化（可选） | 分类色、顺序色、状态色 | |

标「可选」的类别在系统声明不适用时标「不适用」，与「缺」分开。例如一个项目只有一种设备、弹层由播放器叠放时，断点和 z-index 标「不适用」。其余类别不能标「不适用」，没有值时标「缺」并写原因。

## 3. 硬性约束

| 编号 | 约束 | 判定方法 |
|---|---|---|
| C1 | 样本层的颜色、字号、行高、字距、字重、间距、圆角、阴影、时长、缓动只读 CSS 变量 | 按属性白名单机械检查：白名单内属性的值必须含 `var(--…)`、`env(…)`，或是登记过的字面量——`0`、`auto`、`none`、`100%`、`50%`、`currentColor`、`transparent`、`inherit`、媒体查询断点（`var()` 不能用于 `@media`）。样本层指 `<style id="sample-layer">` 与组件、页面模式里元素的行内样式；文档层（卡片框、舞台、标注、顶栏）的版式另成文件，不受 C1 约束 |
| C2 | 每个样本旁标注「token 名 + 计算值」，由脚本读 `getComputedStyle` 生成 | 改一个 token，标注同步变化。计算值按浏览器原样显示（`rgb()` / `color(display-p3 …)`、字距为 px），不强行转 hex |
| C3 | 状态并排静态展示，状态选择器与真实伪类成对书写（`.is-hover, :hover`），状态样式只由状态层 token 推出；状态层的实现（如叠加层工具类）样例页与真实页面共用同一份 | ① 每个状态格至少一项计算样式与默认格不同。对比度只约束两类：焦点指示对相邻颜色 ≥ 3:1（WCAG 2.4.13），选中 / 勾选指示 ≥ 3:1（WCAG 1.4.11）；悬停、按下只要求可分（M3 的 0.08 悬停叠加层前后对比约 1.1），禁用不设对比要求。② Playwright 真实 hover、按下、Tab 聚焦后的计算样式与强制态一致；`:visited` 豁免 ②，因为浏览器对 `:visited` 的 `getComputedStyle` 返回未访问的值 |
| C4 | 根节点 `data-theme` 是模式切换的唯一来源；只有颜色一节亮暗并排，其余各节按模式分别渲染 | 两种模式逐元素比较 color / background / border 计算值，相同又未标 `data-mode-invariant` 的判失败 |
| C5 | 文本样本中英双语，含中英混排与中文标点 | 每档字阶至少一行中文、一行英文 |
| C6 | 零构建、零外网依赖；样例页链接品牌目录里的 tokens.css、字体入口与状态层文件，与产品页面同源；文档层 CSS 是同目录的 `specimen-doc.css`；图标内联 | 断网打开样例页渲染完整。字体只允许 `system-ui` 栈，或品牌目录内的 WOFF2 |
| C7 | 分节，每节有稳定 `id`，可单独截图 | 验收脚本按节截图，一节一张，高于 8000 px 的节按 8000 px 切张。阅读时一节可以长于一屏；规格编号只进元素 `id` 与本文，页面上显示「01 — 品牌基础」这类分组编号 |
| C8 | 「本系统不用」声明：系统不用的手法写进 §4.15，并机械检查；同一份声明也供真实页面的 lint 使用 | 只扫样本层：`meta.notUsed` 里带 `css` 的条目零命中；`backdrop-filter` 只出现在材质样本。文档层顶栏的玻璃滤镜不算违规 |
| C9 | 截图环境可追溯 | 默认 DPR 1，发丝线声明为 0.5px 的系统另跑 DPR 2；截图元数据记录系统、浏览器版本、DPR，以及 CDP `CSS.getPlatformFontsForNode` 读出的字阶样本实际渲染字体。环境不同的两组截图标「不可比」，不做差异判定。基准截图推荐固定用 macOS 机器 |

## 4. 章节

页面分六组，顺序固定；括号里是元素 `id`。各节内容见 4.1–4.22。

| 组 | 节 |
| --- | --- |
| 01 品牌基础 | 品牌概述（`brand`）、标志（`logo`）、应用图标与网页图标（`app-icon`）、品牌色（`brand-color`）、品牌字体（`brand-type`）、辅助图形（`motif`）、语气与文案（`voice`），见 4.19 |
| 02 基础 | 颜色（`color`，4.3）、字体与字阶（`type`，4.1、4.2）、间距圆角与层级（`shape`，4.4、4.5）、材质（`material`，4.5）、状态与焦点（`states`，4.6）、图标（`icons`，4.7）、动效（`motion`，4.13）、数据可视化（`charts`，4.14） |
| 03 组件 | 按钮（`buttons`，4.8）、表单（`forms`，4.9）、导航与列表（`navs`，4.10、4.11）、反馈与浮层（`feedback`，4.12） |
| 04 页面模式 | 通用（`patterns`，4.16、4.20）、本产品（`product`，4.18、4.20） |
| 05 物料 | 物料（`apps`，4.21） |
| 06 开发参考 | 接入（`dev`，4.22）、全部 token（`tokens`，4.22）、文件（`downloads`，4.22）、本系统不用（`notused`，4.15）、压力测试（`stress`，4.17） |

版式由渲染器固定：文档层（页标题、导语、节眉、节标题、卡片框、说明）用固定的文档字阶，只取品牌的字体、文字色、表面色与分隔线色；样本层严格用品牌 token。每个样本一张卡，卡下三行：名称、短值、一句用途（tokens 的 `$description` 或 `specimen.json` 的 `uses`）；CSS 变量与 Tailwind、shadcn 类名收进「开发视图」开关，默认关闭。

### 4.1 字阶

- 每档一行：档名、token 名，字号 / 行高 / 字距 / 字重的计算值，中文样本与英文样本各一行。每档字距必须显式声明并实测，不能只在全局设一个值。
- 中文覆盖（`:lang(zh)` 下的字距、行高、字体族）与西文值同时展示。
- 系统声明了展示字阶（`typographyDisplay`）时另列一组，标明用于固定画布的宣传物料，不与界面字阶混排。
- 字重：列出允许集合，页面实际用到的字重不超出集合。
- 阅读行宽：一段 8–10 行正文。西文 inline-size 65–75ch，中文 35–45em。
- 两行标题，展示 `text-wrap: balance`。
- 数字列，展示 `tabular-nums` 对齐。
- 中文标点样本：“”‘’…—《》，。、；：？！，检查引号是否被西文字体渲染成西文比例宽。

### 4.2 正文行内元素

- 链接：默认 / 悬停 / 焦点三态；已访问态可选，只能用强制类渲染，标注取 token 值。
- 行内代码、`kbd`、`mark` 高亮。
- 强调：西文可用斜体或加粗；中文不用斜体，用加粗或着重号（`text-emphasis`）。
- `::selection` 与 `caret-color`。

### 4.3 颜色

- 按 §2 的角色逐个列出：token 名 + 计算值。
- 对比度：每个前景角色对全部表面 token 逐一计算，半透明色先与底色合成。阈值：正文 4.5，大字、图标、控件边界 3.0（WCAG 1.4.3 / 1.4.11）。不达标的标红。
- 亮暗两套并排（C4 唯一例外）。

### 4.4 间距

- 刻度逐档画条，标值。
- 示例区演示「组内 < 组间 < 区块」三层关系。

### 4.5 圆角、层级与材质

- 每档圆角样本；胶囊样本。
- 嵌套圆角：外、内同心；内圆角算出来小于下限时取下限的样本。
- 层级：sunken / default / raised / overlay 四层表面与阴影成对展示，亮暗各一；z-index 刻度表。
- 发丝线：按 §2 声明的值渲染一组分隔线（全宽、带缩进）。
- 材质：半透明背景压在复杂底图上，含其上的文字（vibrancy）样本。系统不用材质则省略并在 §4.15 声明。

### 4.6 焦点与状态层

- 焦点环分别放在默认表面、抬升表面、主色填充、材质上，各一个样本。聚焦前后同一批像素对比 ≥ 3:1（WCAG 2.4.13）。
- 状态层一行：同一块底色叠加 hover / focus / pressed / dragged / disabled，标透明度。

### 4.7 图标

- 同一套图标在各尺寸下的样本，描边粗细一致。
- 图标与同行文字对齐：图标 + 文字按钮、列表行首图标。

### 4.8 按钮

- 主 / 次 / plain / 危险四种 × 默认 / 悬停 / 按下 / 焦点 / 禁用 / 加载六态，做成矩阵。文字链接归 §4.2，不在这里重复定义。
- 尺寸档；纯图标按钮。
- 点击区：`pointer: fine` 下不小于 24×24，`pointer: coarse` 下不小于 44×44。

### 4.9 表单

每个组件一张显式状态矩阵：

| 组件 | 状态 |
|---|---|
| 输入框、多行输入 | 空（占位符）/ 已填 / 聚焦 / 出错（带错误文案）/ 禁用 / 只读 |
| 选择器 | 收起 / 展开（菜单画在节内定高框里）/ 禁用 |
| 复选框 | 未选 / 选中 / 半选 / 禁用 |
| 单选、开关 | 未选 / 选中 / 禁用 |
| 分段控件、滑块 | 默认 / 聚焦 / 禁用 |

### 4.10 列表、卡片与表格

- 列表行：首图标 + 标题 + 副标题 + 尾部（数值 / 箭头 / 开关）；分隔线缩进。
- 分组列表：组标题、组脚注。
- 卡片：纯文字卡、带图卡（固定比例 + `object-fit: cover`）、卡内嵌套元素（嵌套不超过 1 层）。
- 头像：图片、首字母兜底。图片加载失败占位。图上文字加遮罩。
- 表格：表头、数值列右对齐、选中行、斑马纹或分隔线。产品有数据表时必做，否则可省略。

### 4.11 导航

- 顶栏、标签栏或侧栏条目：激活 / 未激活 / 悬停。

### 4.12 反馈与叠层

- 提示条（toast / banner）、徽标、气泡提示。
- 对话框、底部弹层：在节内定高框里静态渲染（含遮罩），不用 `position: fixed` 盖住整页。
- 加载（骨架屏 / 进度）、空态、错误态各一个样本。

### 4.13 动效

- 时长、缓动 token 逐档列表，缓动画成曲线。
- 每档时长一个可点按播放的位移演示，默认静止。
- `prefers-reduced-motion: reduce` 下各档时长的计算值：位移、缩放乘以 `reducedMotion`，透明度过渡保留。

### 4.14 数据可视化

- 分类色板（`dataViz.series`，shadcn 适配取前 5 色为 `--chart-1..5`）、顺序色（`dataViz.sequential`）、发散色（`dataViz.diverging`）；分类色逐色对四层表面 ≥ 3:1。
- 色板之外画真实图表：折线（系列 1–3，线尾直接标注）、分组柱状（1–3）、面积（1–2）、散点（只用 1–3）、环形（1–4）。网格线、坐标轴、轨道没有 token 时借用分隔线、弱文字与凹陷表面，并标「缺」。
- 默认必做；token 把 `dataViz` 声明为 notApplicable 时只留节标题并标「不适用」。

### 4.15 本系统不用

- 逐条列出本系统不用的手法（例：渐变、发光、彩色阴影、毛玻璃、卡片嵌套），与 C8 的机械检查一一对应。清单取自 token 的 `meta.notUsed`；带 `css` 的条目按属性（忽略厂商前缀）或值模式（不区分大小写）机械检查，不带的条目人工核对。

### 4.16 参考小屏

- 用本页组件拼手机页面，宽度 390，按 1:1 绘制，暴露层级与留白节奏。只用本页已有组件，不引入新样式。具体页面见 4.20。

### 4.17 压力测试

- 中英混排段落：中西文间距用 `text-autospace: normal` 或手动空格，二选一并声明。
- 超长标题、超长按钮文字：截断或折行。
- 页面缩放 200%（WCAG 1.4.4）与文字间距覆盖（WCAG 1.4.12）：每节 scrollWidth ≤ clientWidth，overflow 隐藏的元素无内容被裁，兄弟元素框不重叠。

### 4.18 项目自有组件（可选）

- 本产品的主界面与自有组件由品牌片段提供（`sections.product`，样式放 `sampleCss`），同样只引用 token 变量，计入 C1 / C8。
- 样例页 §4.11 的导航由渲染器画出，与项目自有组件可能不一致；没有这一节时，评审不能拿 §4.11 代表项目的真实导航。

### 4.19 品牌基础

品牌片段提供，渲染器只负责外框与占位符（§8.2）。片段缺失时整节标「缺」，品牌声明不适用时标「不适用」。

- 品牌概述：定位、视觉隐喻、主张，以及从「本系统不用」归纳的设计原则。
- 标志：横向组合、竖向组合、符号，浅底、深底、图片上；全部色版；安全区与最小尺寸；错误用法（拉伸、旋转、改颜色关系、浅底版放深底、整体描边、加效果）各一张，标明「仅作说明」。
- 应用图标与网页图标：App 图标各平台预览、网页图标 16 / 32 / 48 原尺寸、浅色与深色浏览器标签栏。顶栏的符号 28 px：品牌有小尺寸简化符号时用它，没有时用完整符号，并在最小尺寸卡上注明顶栏是文档页例外；品牌规定顶栏只放字标时，用 §8.2 的 `logo.topbar` 关掉符号。
- 品牌色：品牌色板（数字端 RGB / HEX，印刷另行打样），以及每个品牌色落到哪个界面角色的映射表。
- 品牌字体：每个字体族的字形样本、字重、用途；字标的字体参数与是否已转轮廓。
- 辅助图形、插画与图片风格：品牌有这类资产时展示，并写使用规则。
- 语气与文案：主张与短句、品牌名写法、中英混排与标点、数字日期金额格式、提示与错误句式。

### 4.20 页面模式

- 通用：登录、危险操作确认（底部弹层，焦点落在取消）、设置、空状态、加载中（骨架屏）、整页错误，按 390 宽画在手机框里。
- 本产品：见 4.18，节眉标「本产品」，与通用模式分开。

### 4.21 物料

- 用 `brand.json` 或品牌模板渲染的公告图、封面、竖版海报，标明画布尺寸、所用展示字阶与源文件，证明物料与界面同源。

### 4.22 开发参考

- 接入：引入顺序（token 文件 → 字体入口 → 状态层；Tailwind 下状态层进 `layer(base)`）、全局规则（`font-synthesis`、`color-scheme`、在 `body [lang]` 上重套正文字阶、Tailwind 的 `@custom-variant dark`）、主按钮与提交中的写法。
- 产品代码里的写法：每个颜色角色与字阶的 CSS 变量、Tailwind 类名、shadcn 类名，从两个适配文件读出；适配文件没映射的写变量。
- 修改与重建：哪些文件是生成物、改值后跑哪几条命令。
- 全部 token：tokens.css 逐项，浅色与深色并排，另列每种语言覆盖。
- 文件：标志、图标、token 与适配文件、字体与许可、品牌包，附文件大小；使用授权没有写时标「缺」。

## 5. 验收

第 1–4 步由验收脚本 `check-specimen.mjs` 完成（§8.3），第 5 步另行执行。

1. **截图集合**：390 与 1440 两个宽度 × 每个模式，按节截图（C7、C9）；另在 1440 浅色下各截一次 `prefers-contrast: more` 与 `forced-colors: active` 的整页。forced-colors 下 box-shadow 会被强制去掉，只靠阴影区分的卡片、用 box-shadow 画的焦点环在这组截图里必须仍然可辨。
2. **数值检查**：带 `data-token` 的色块与角色颜色在每个模式下等于 resolved 快照；字阶样本的字号、行高、字距、字重与字体族首项按语言等于 resolved 快照（中文取 `langOverrides`）；标注计算值的元素不为空。
3. **状态检查**：C3 的两步，加文本框聚焦、提交中演示、从页首起 16 个 Tab 停点都有可见焦点环；WCAG 1.4.12 文字间距覆盖下每节不横向溢出。
4. **机械门**：C1 白名单、C8 notUsed 只扫样本层；控制台零报错、零加载失败；页面不横向溢出。
5. **视觉评审**：由没参与制作的评审方，只拿按节截图（细节处裁图放大）与参考图，逐节列差异。该步骤属于评审流程，不属于样例页生成工具。

`prefers-reduced-transparency` Safari 不支持，材质的降透明回退只在 Chromium 下验。

## 6. 语义角色 → token 映射表

样例页按角色取值，每套设计系统提供一张映射表。profile-2 token 的 `meta.roles` 就是这张表的机器可读形式：角色值为叶子路径，或 `{status, reason}`。以 Quilt 为例（消费方示例，随 Quilt 变化；Material 3 色键，含其 token 扩展计划新增的三个表面键）：

| 角色 | token 键 |
|---|---|
| 文字 · 主 | onSurface |
| 文字 · 次 | onSurfaceVariant |
| 文字 · 弱 | outline（对 surface 的对比度在 4.5 上下，以 §4.3 实算为准） |
| 表面 · sunken / default / raised / overlay | surfaceSunken / surface / surfaceRaised / surfaceOverlay |
| 强调 | primary |
| 强调上的文字 | onPrimary |
| 选中高亮 | secondaryContainer |
| 分隔线 | outlineVariant |
| 成功 / 警告 / 错误 | success / warning / error |

映射不到的角色在页面上标「缺」。surfaceVariant 在亮色下比 surface 暗，不能当 raised 用，否则亮色下抬升的卡片比底色深。

## 7. 未决事项

中文覆盖在真实页面上生效，依赖消费方按 token 的 `meta.languages` 设置 `<html lang>`；Quilt 以项目级语言设置实现。token 的中文覆盖只在带 `lang` 属性的元素上重声明，嵌入其他语言的样本取回基础值；样本上要重新应用字阶属性（字阶类或 `[lang]` 规则），继承来的 `font-family` 已是计算后的字体列表，不会随变量切换。

1. SF Pro 的网页授权：按现有资料只能走 `system-ui`，非 Apple 机器上会渲染成别的字体。这类截图与 macOS 基准按 C9 标「不可比」。
2. C4 的逐元素亮暗比较还没进验收脚本：标志、品牌色块这类亮暗同值的元素要先标 `data-mode-invariant`。在那之前由暗色按节截图的视觉评审代替。

## 8. 渲染器与验收脚本

### 8.1 命令

在品牌目录（产品仓的 `brand/`，或独立品牌仓的根目录）执行：

```sh
node <visual-system 技能目录>/scripts/specimen/render-specimen.mjs .
NODE_PATH=$(npm root -g) node <visual-system 技能目录>/scripts/specimen/check-specimen.mjs .
```

渲染器只用 Node.js 内置模块，写出 `out`（默认 `examples/specimen.html`）与同目录的 `specimen-doc.css`。验收脚本需要全局 Playwright（`npm i -g playwright`）与它的 `chromium-headless-shell`（`npx playwright install --only-shell chromium`），整次运行只起一个浏览器，写出 `qa/specimen/specimen-check.json` 与按节截图 `<节 id>-<宽度>-<模式>.png`，失败时退出码 1。`--config` 换配置文件，验收脚本另有 `--out` 换证据目录、`--dpr` 换像素比。改 tokens、片段或配置后两条命令都要重跑。

### 8.2 specimen.json

路径都相对品牌目录。片段与 `hero`、`notes`、`uses` 里的字符串按 HTML 原样插入，可用占位符：`{{src:路径}}`（从输出页到该文件的相对地址）、`{{inline:路径}}`（内联 SVG，供 `currentColor`）、`{{size:路径}}`（文件大小）、`{{hex:token 路径}}`（默认模式 resolved 快照里的色值）/ `{{hex-light:token 路径}}` / `{{hex-dark:token 路径}}`（指定模式的色值）、`{{icon-count}}`。片段里直接写的相对路径以输出页所在目录为基准。

| 字段 | 必填 | 含义 |
| --- | --- | --- |
| `brand`、`version`、`lang` | `brand` | 品牌名、版本号（顶栏徽标）、页面语言，默认 `zh-CN` |
| `out` | 否 | 输出页，默认 `examples/specimen.html` |
| `tokens` | 否 | `tokens.json`、`tokens.css`、resolved 快照与适配文件所在目录，默认品牌目录本身。默认模式取 `meta.defaultMode`（缺省 light），它的快照是 `tokens.resolved.json`、写在 tokens.css 的 `:root`，另一模式读 `tokens.resolved.<模式>.json` 与 `[data-theme="<模式>"]`；页面先显示默认模式，模式切换里它排第一 |
| `stateLayer`、`fonts` | 是 | 状态层 CSS 与字体入口 |
| `icons`、`favicon` | 是 | 图标目录（逐个 SVG）与网页图标 |
| `logo` | 是 | `symbol`、`symbolReverse`、`symbolSmall`、`symbolSmallReverse`、`wordmark`、`wordmarkReverse`、`lockup`、`lockupReverse`；顶栏、登录与空状态用。可选 `topbar`：`height`（顶栏字标高度，px）、`symbol: false`（顶栏只放字标）、`wordmark` / `wordmarkReverse`（顶栏另用的字标） |
| `hero` | 否 | `eyebrow`、`title`、`titleLang`、`tagline`、`lead`、`facts`（`[[粗体, 说明], …]`，默认按 tokens 统计）、`panel`（首屏右栏底色的 token 路径，默认强调色）、`panelImage` |
| `doc` | 否 | `fonts.zh / en / display`：文档层字体的 token 路径，默认正文与首个展示字阶的字体族；`stages`：`{名称: token 路径}`，生成 `.stage.<名称>` 底色供片段使用 |
| `components` | 否 | `radius.control / card / sheet`：控件、卡片、底部弹层的圆角 token，默认按值取最接近 10、16 的一档与最大一档；`badge.fill / text`：徽标底色与字色，默认选中高亮与主文字；`icons`：`{用途: 图标名}`，覆盖内置的用途到图标名映射 |
| `sections` | 01 组与 `downloads` 是 | `{节 id: 片段路径}`，节 id 为 `brand`、`logo`、`app-icon`、`brand-color`、`brand-type`、`motif`、`voice`、`product`、`apps`、`downloads`，另可给 `dev`（接在生成的接入节之后）；值也可以是 `{"status": "notApplicable", "reason": "…"}`。片段从 `<h2>` 开始写，节眉由渲染器加 |
| `sampleCss` | 否 | 品牌自有样本的 CSS，追加进样本层，同样受 C1、C8 约束 |
| `notes` | 否 | `{节 id: 导语}`，替换生成节的默认导语 |
| `uses` | 否 | `{token 路径: 用途}`，替换卡片下的用途说明 |
| `devPrefix`、`rebuild` | 否 | 接入代码里的路径前缀（默认 `brand/`）；「修改与重建」代码块的行，默认是生成器与这两条命令 |

渲染器对样本层的要求：tokens 有 `primitive.dimension.space` 刻度、`semantic.radius` 至少一档非胶囊圆角、`semantic.typography` 的 caption、label、body、bodyStrong、heading1–3，样本 CSS 引用的其余 `--semantic-*` 变量（叶子名同 BD-TOKEN-001 的满深度示例）都在 tokens.css 里；缺一项时退出码 1 并指出缺的变量。图标集里没有某个用途的图标时，相应样本不画图标，图标节列出这些用途。

### 8.3 验收脚本的范围

验收脚本只证明 §5 第 1–4 步能机械判定的部分：它不评价版式与配色是否好看，不做完整无障碍审计，不覆盖其他操作系统与原生平台。页面缩放 200% 由 390 宽的溢出检查代替；C4 见 §7 第 2 条。按节截图交给第 5 步的视觉评审。

## 附录 A · 状态层与焦点环（规范性）

C3 要求样例页与真实页面共用同一份状态层实现。消费方把下面的变量映射到自己的 token 变量上：`--state-*` 取 `meta.roles` 中 `state.*` 指向的叶子，`--focus-ring-*` 取 `focusRing.*`，`--motion-*` 取动效档。

```css
:where(.state-layer) { position: relative; isolation: isolate; }
.state-layer::after {
  content: ""; position: absolute; inset: 0; z-index: -1; border-radius: inherit;
  background: currentColor; opacity: 0; pointer-events: none;
  transition: opacity var(--motion-duration-fast) var(--motion-ease-standard);
}
@media (hover: hover) { .state-layer:hover::after { opacity: var(--state-hover); } }
.state-layer.is-hover::after { opacity: var(--state-hover); }
.state-layer:focus-visible::after, .state-layer.is-focus::after { opacity: var(--state-focus); }
.state-layer:active::after, .state-layer.is-pressed::after { opacity: var(--state-pressed); }
.state-layer.is-dragged::after { opacity: var(--state-dragged); }
.state-layer.is-field:focus-within::after, .state-layer.is-field.is-focus::after { opacity: 0; }
.state-layer:disabled, .state-layer[aria-disabled="true"], .state-layer.is-disabled, .state-layer.is-field:has(:disabled) { opacity: var(--state-disabled); }
.state-layer:disabled::after, .state-layer[aria-disabled="true"]::after, .state-layer.is-disabled::after, .state-layer.is-field:has(:disabled)::after { opacity: 0; }
.focus-ring:focus-visible, .focus-ring.is-focus, .focus-ring.is-field:has(:focus-visible) {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
}
```

- 宿主定位用零特异性的 `:where()`，组件自己的 absolute / fixed / sticky 定位优先。`isolation: isolate` 加 `z-index: -1` 让叠加层画在宿主背景之上、内容之下。
- 悬停只在 `@media (hover: hover)` 下生效，触屏不留悬停态；强制类 `.is-*` 在媒体查询外，样例页的静态格照样显示。
- 减少动态效果（`prefers-reduced-motion: reduce`）时保留状态层的透明度过渡和组件的颜色过渡，只去掉位移、缩放类动效，与 ui-constraints 的 MOTION-004 一致；不给 `.state-layer::after` 写 `transition: none`。
- 禁用元素的叠加层归零，这条写在所有状态规则之后；禁用本身用元素透明度表达。
- 焦点环是单独的 `.focus-ring` 类，用 outline 加 offset，forced-colors 下仍可见；不写成全局 `:focus-visible` 规则。
- 选中状态用「选中高亮」颜色角色，不走叠加层。组件自身已占用 `::after` 时，外面再包一层元素承载状态层；`input`、`img` 等替换元素没有 `::after`，同样放在外层。
- 文本输入把状态层与焦点环放在外层元素上并加 `.is-field`：输入框获得焦点时（包括按下的一瞬）叠加层归零，只显示焦点环，以免看起来像禁用；外层随内部控件的 disabled 变淡。`:has()` 需要 Chromium 105、Safari 15.4、Firefox 121 及以上。
- 系统把某个状态角色标为不适用时，只删掉读取该变量的那一行，其余规则逐字保留，样例页与真实页面仍共用同一份。
- 叠加后的文字对比度仍按 §4.3 计算：按钮与链接文字叠 hover、focus、pressed 层后，正文叠 dragged 层后，仍须 ≥ 4.5:1。
