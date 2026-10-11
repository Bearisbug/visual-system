# 黑白产品意象 · Prompt 模板

当前库内例图的完整实际 Prompt、输入和输出以 [generated.json](generated.json) 为准，图像见 [EXAMPLES](EXAMPLES.md)。以下是供新任务使用的模板；按[艺术方向](../ART-DIRECTION.md)选择克制表现，用户已定品牌优先。模板的迁移状态与样例重绘分别记录。

本文件是根据 [STYLE.md](STYLE.md) 的样本观察编写的通用自然语言模板，用于新品牌概念探索。不是原作者提示词；没有模型专用参数，也没有实测生成结果。优先遵循用户已确定的形状、品牌名、用途和本轮修改范围。

## 使用前

先从任务取得品牌名、产品用途、选定分支、文字策略与交付场景。每个 `{{字段}}` 必须替换为具体内容后再提交；缺少会改变构思的输入时只澄清该项。用户已提供完整输入时直接写成可用 Prompt。

将参考分成形状依据、材质依据、呈现依据。只有明确选定的自有标志可作为需要保持的形状；第三方样本只借可迁移的方法，不复制其识别轮廓与字标。

## A · 灰阶立体单体

参考 [12 个实体表现案例](EXAMPLES.md)。主体可以是器物、字形或抽象轮廓；先决定构思，再选择体积与材质。

```text
Design an original brand mark for {{brand}}, a product that {{product purpose}}.
Build the concept around {{one product-relevant object, letterform or abstract silhouette}}.
Use one clear silhouette with simplified proportions and a deliberate focal detail.
Render its volume in charcoal, soft black and pale grey, using broad restrained
highlights and a short soft contact shadow. Keep the background quiet and the
form readable before its surface details. Specify the surface as {{material}}.
Presentation: {{standalone mark or app-icon concept}}.
Text treatment: {{exact lettering instruction or no lettering}}.
The reference establishes tonal hierarchy and surface craft; create new geometry
for this brand. Exclude scenery, extra props, decorative sparkles and borrowed logos.
```

检查重点：主体是否符合品牌；轮廓能否独立辨识；材质是否遮蔽结构。若需要平面版，另从确定母版制作，不把一张生成板里看似相同的两个图当成几何一致证明。

## B · 功能与界面隐喻

参考 [10 个结构案例](EXAMPLES.md)。在操作、读数、信息版式与状态差异中选一项；只有主辅结构确实存在时才要求强弱层级。

```text
Create an original brand mark for {{brand}}, which helps people {{product purpose}}.
Derive its geometry from {{one interaction, readout, content structure or state relationship}}.
Make {{primary structural relationship}} clear. If supporting detail is needed,
render {{necessary secondary structure}} in lighter or finer marks. Use a restrained
black, grey and off-white tonal system with a clear hierarchy between main and
supporting elements. Keep only details that contribute to the product association.
Text treatment: {{exact label or no label}}.
Presentation: {{intended canvas and background}}.
Do not reproduce the reference product's letters, dial layout or unique geometry.
```

检查重点：主辅结构是否形成层级；简化后产品关系是否还在；密集细节在目标尺寸是否糊成一片。

## C · 字母与排版

参考 [10 个字母与排版案例](EXAMPLES.md)。先选择字母、标点或短词，再指定衬线、无衬线、定制骨架及分行方式；背景纹理按需加入。

```text
Explore a distinctive typographic brand mark for {{brand}} using {{exact letters, punctuation or short words}}.
The product is {{product purpose}} and the desired tone is {{brand tone}}.
Develop {{specified serif, sans-serif or custom construction}} with deliberate
proportions, clear counters and {{line arrangement}}. Let the typography dominate.
Use {{light-on-dark or dark-on-light tonal pairing}}. If background texture is requested, use
{{product-relevant texture}} at a contrast substantially below the main letter.
Keep every intended character legible. No additional initials or invented text.
The output is a letterform concept; final lettering will be built from editable
type or vector geometry. Avoid copying the reference brand's letter outline.
```

检查重点：实际字母是否正确；字形是否有新品牌自己的特征；背景会不会抢走注意。字体选择需独立试排，不能由生成图倒推一个未经证实的字体名。

## D · 抽象几何

参考 [10 个几何案例](EXAMPLES.md)。先选择关系，再比较占比与位置；小型偏置、居中点阵和闭合分区不能共用一个固定坐标模板。

```text
Design an original abstract brand mark for {{brand}}, a product for {{product purpose}}.
Express {{one brand-relevant relationship}} through an arrangement of
{{chosen geometric elements}}. Establish identity through the relationship between
shapes, gaps and alignment. Use strong light-on-dark or dark-on-light contrast.
Set the canvas occupancy to {{intended visual scale}} and placement to {{chosen placement}}.
Keep the silhouette and internal spaces readable at the intended display size.
Do not borrow the source logo's exact element arrangement or proportions.
Text treatment: {{lettering instruction}}. Output: {{intended presentation}}.
```

检查重点：是否只得到通用统计图/信号图标；主体是否因过小失去识别；位置与留白是否对这个品牌有意义。样本的偏置是候选方法，不是固定模板坐标。

## 定向修改

先写“保持什么”，再写“本轮只改什么”：

```text
Use {{selected version}} as the geometry reference for {{brand}}.
Preserve {{named silhouette features, gaps and proportions}}.
Change only {{specific requested dimension}} toward {{observable target}}.
Keep {{already approved lettering and color decisions}}.
Return {{required views}} so the requested change can be compared directly.
```

用户要求全新构思时不用该模板锁定旧轮廓，应重新选择产品意象或形状关系。模板提出的约束均需要检查实际输出，不能凭 Prompt 内容判定完成。
