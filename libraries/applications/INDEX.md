# 品牌应用模板

用品牌项目的最终资产、字体和颜色生成可编辑数字物料。先按 [品牌系统与应用流程](../../references/flow-system.md)确定本次用途，再按 [数据合同](contract.md)准备输入。

| 模板 | 用途与信息顺序 | 默认画布 | 编辑源 |
| --- | --- | --- | --- |
| announcement | 产品介绍；品牌、栏目、主标题、说明、辅助图形、页脚 | 1200 × 630 | [HTML](templates/announcement.html) |
| story | 竖版内容；品牌、栏目、标题、图形、说明、页脚 | 1080 × 1350 | [HTML](templates/story.html) |
| cover | 文档封面；品牌、文档类别、标题、摘要、图形、页脚 | 1600 × 900 | [HTML](templates/cover.html) |

三份模板提供对应画布与信息槽，具体位置、字号、行高、对齐和图形关系通过每项 layout 映射已确认品牌参数；没有完整映射时不能构建。这些尺寸属于当前模板版本，不代表任何平台的最新上传规范。模板 HTML 按画布等比例缩放供预览；导出 PNG 使用上表尺寸、1 倍设备像素比，并实际检查结果。窄屏缩略图不承担响应式正文阅读功能；品牌手册应另做可读的移动布局。

## 使用

依赖 Node.js 20+；渲染器使用内置模块，输出无需框架或构建工具。字体来自品牌输入，不能通过填入家族名代替取得字体文件。

```sh
node /absolute/skill/libraries/applications/render.mjs \
  --brand /absolute/project/brand.json \
  --content /absolute/project/content.json \
  --output /absolute/project/output
```

输出包含可编辑 HTML、品牌 CSS、资源副本及构建记录。浏览器打开实例即可预览。逐槽测量行数、溢出与槽间相交并导出 1x PNG：

```sh
node /absolute/skill/scripts/check-application.mjs /absolute/project/output
```

它需要 Node.js 22+ 与一个 Chromium 系浏览器，证据写入 `output/qa/`，合同见 [浏览器测量](contract.md#浏览器测量)。[render.mjs](render.mjs)只生成文件，`build.json` 的视觉/浏览器状态始终是 `not_run`。实际验收按 [BD-APPLICATION-001](../../references/system.md#bd-application-001)与 [BD-QA-001](../../references/assets.md#bd-qa-001)记录。

## 维护

画布与模板文件的唯一登记处是 [templates.json](templates.json)。修改模板须检查所有受影响的品牌实例、正常文案及长内容；新增模板先定义用途和输入槽，再提供真实实例与验证。品牌项目的 Logo、字体、JSON 和样张留在项目中，不收进通用库。

模板没有自动缩字或截字。内容过长时必须重新排版或明确更改内容，再验证目标尺寸。品牌专属参数与使用限制由品牌规范管理；每项布局回指该来源，不能只换颜色和字体名称就声称品牌接入完成。
