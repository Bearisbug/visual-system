# Notice / 第三方材料声明

The MIT License in [LICENSE](LICENSE) covers this repository's original text, scripts, templates and logo. Third-party works and images incorporating third-party marks are not relicensed under MIT by this repository.

[LICENSE](LICENSE) 中的 MIT 许可覆盖本仓库原创文本、脚本、模板与 Logo。第三方作品及包含第三方标志的图像不随本仓库重新授权。

## Vendored code / 上游副本

`vendor/theme-extract/` is a verbatim copy of the same author's token generator, format documents and example. The upstream commit and file hashes are recorded in `vendor/theme-extract/SOURCE.json`; this code is covered by MIT.

`vendor/theme-extract/` 为同一作者的 tokens 生成器、格式文档与示例原样副本，上游提交与逐文件 SHA-256 见 `SOURCE.json`，代码采用 MIT。

`vendor/cc-lineart/` is a verbatim copy of [CC-lineart](https://github.com/aa2246740/CC-lineart) by BiggerdreamStudioDavid: a line-art script, motif library, method documents and previews, under the MIT License copied as `vendor/cc-lineart/LICENSE`. Its built-in palette follows Anthropic's brand colors and two motifs draw the Claude spark; this repository uses that palette only as source research and does not grant rights to Anthropic marks.

`vendor/cc-lineart/` 为 BiggerdreamStudioDavid 的 [CC-lineart](https://github.com/aa2246740/CC-lineart) 原样副本（线稿脚本、母题库、方法文档与预览图），采用 MIT，许可原文见 `vendor/cc-lineart/LICENSE`，上游提交与逐文件 SHA-256 见 `SOURCE.json`。其内置色板取自 Anthropic 品牌色，两个母题画有 Claude 星芒；本仓库只把该色板作为来源研究，不对 Anthropic 的标志授予任何权利。

## Fonts / 字体

Space Grotesk, Noto Sans SC and JetBrains Mono files in `libraries/fonts/files/` are distributed under SIL OFL 1.1. License texts are in `libraries/fonts/licenses/`; source, version and hashes are in `libraries/fonts/sources.json`.

上述字体保留原始文件，按 SIL OFL 1.1 分发；具体许可、来源、版本与校验和在字体目录内记录。

## Source references / 第三方来源

Images in `libraries/styles/*/references/` belong to the designers, studios and brands identified in `REFERENCES.md`, `SOURCE.md` where present, and `sources.json`. Original captures, format conversions and any AI clarity enhancements are separately recorded. These images are study references, not assets licensed by this repository for new brands.

`references/` 下的原采集、格式预览及已标记的 AI 清晰化图用于来源研究。署名、来源与未知项见各包的来源记录。本仓库不对第三方图片授予新许可，也不将它们作为新品牌成品。

## AI studies / AI 研究图

`libraries/styles/*/generated/` contains two labelled kinds of imagegen study. `generated.json` records reinterpretations linked to source sample IDs, with actual prompts, inputs, tools, output hashes and review scope. `originals.json`, where present, records independent text-brief concepts created for this library. Those concepts do not have third-party authorship or real brand adoption records. “Original study” describes how the concept was authored and generated; it is not a trademark clearance or legal originality determination. These AI studies are not works by the cited designers, official redesigns or vector masters.

`generated/` 保存来源重新演绎与本库独立原创研究两类图。前者在 `generated.json` 连接源样本；后者在 `originals.json` 记录文字简报、方法与生成过程，虚构名称和构思不代表真实品牌采用，也不能归给包中来源作品的作者。原创描述本库的构思与生成来源，不证明商标清查或法律上的独创性认定。示例页与总览均分别标注；这些研究图不是正式母版或已核验可用的新品牌资产。AI 改色、重排与补绘不会改变第三方商标和原作的归属，生成图不提供其转授权证明。

If you own referenced work and request removal or corrected attribution, open an issue in this repository.

如需移除作品或更正署名，权利人可在本仓库提交 issue。
