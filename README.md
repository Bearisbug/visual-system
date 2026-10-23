<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/assets/logo-dark.svg">
    <img src=".github/assets/logo.svg" alt="visual-system logo" width="120" height="120">
  </picture>
</p>

<h1 align="center">visual-system</h1>

<p align="center">An Agent Skill for logo design, brand language, editable brand assets and developer visual handoff.</p>

<p align="center"><b>English</b> · <a href="README.zh-CN.md">简体中文</a></p>

---

`visual-system` guides an AI coding agent through brand work: designing or iterating a logo, extracting a visual method from references, verifying fonts, writing a brand language and guidelines, producing editable brand materials, and handing brand parameters to developers as tokens, font config and component state examples. The agent can start from a new brief or from work that already exists, and runs only the stages you ask for.

The skill text is written in Chinese. Use an agent that can read it; the task and output language can follow your request.

## Start with any agent

Open [SKILL.md](SKILL.md) with the agent's file reader, treat its folder as the skill root, and follow the matching task route. A proprietary skill-loading command is not required. For technology, AI and SaaS directions, start with the [style selector](libraries/styles/SELECT.md). It separates identity, communication materials and interface parameters.

The [runtime guide](references/runtime.md) maps deliverables to capabilities. A text-only agent can prepare a brief or direction study; image review, rendering, token checks and platform integration require their actual tools. Record missing checks and hand off the current files and decisions. Adjacent skills such as ui-constraints and code-video are optional task-specific workflows; their absence does not prevent completing the independent brand work. This is a portable instruction contract, not a certification of every agent or platform.

## What it covers

| Task | Where the agent starts |
| --- | --- |
| New logo, continuing a direction, comparing and iterating | [Logo flow](references/flow-logo.md) |
| Working from a reference or a named visual method | [BD-REF-001](references/design.md#bd-ref-001) + [style index](libraries/styles/INDEX.md) |
| Wordmarks, font pairing, Chinese/English typesetting | [BD-TYPE-001](references/assets.md#bd-type-001) + [font index](libraries/fonts/INDEX.md) |
| Recoloring or re-rendering an existing logo | [BD-EDIT-001](references/design.md#bd-edit-001), [BD-MATERIAL-001](references/design.md#bd-material-001) |
| SVG/PNG masters, favicon, base asset delivery | [BD-MASTER-001](references/assets.md#bd-master-001) + [validation contract](references/validation-contract.md) |
| Brand language, guidelines, supporting graphics, real materials | [Brand system flow](references/flow-system.md) + [application templates](libraries/applications/INDEX.md) |
| Design-system tokens shared by marketing materials and product UI, icons | [BD-TOKEN-001](references/system.md#bd-token-001), [BD-ICON-001](references/system.md#bd-icon-001) |
| Dev visual spec, tokens, font/asset config, component states | [Handoff flow](references/flow-handoff.md) + [Web consumption checks](references/handoff-web.md) |

Business requirements, page navigation, APIs and product code are out of scope; the skill hands those to the matching task.

## How it works

Every direction, version and change is recorded with a stable ID, the full prompt, each reference and its role (concept, shape, material, typography or application), the output path and the feedback. New directions must differ in imagery, silhouette or internal construction; a recolor or a new background does not count as a new idea.

A formal logo gets an editable master built from real paths. A bitmap embedded in SVG does not count, and generated images are never treated as trustworthy vector masters, correct lettering or real transparency. Exports come from that one master, optical and material variants are labelled, and every promised file must exist and be readable.

Mechanical checks, visual review and behavior tests are reported separately. Small sizes, mono and reversed versions, light and dark backgrounds, spelling and real applications are checked on the actual output, and a validator passing is never reported as a visual pass.

Browse the [style casebook](libraries/styles/CASEBOOK.md) for current AI studies. Source archives retain the original identity and application evidence; three blocked examples and one supporting-pattern substitution are explicitly labelled.

## What's inside

```text
SKILL.md                 entry: task routing and working rules
references/              16 rule cards (BD-*), runtime guide, flows, validation contract
libraries/styles/        12 styles, 152 AI studies (119 reinterpretations + 33 originals), 122 sources, 3 blockers
libraries/fonts/         Space Grotesk, Noto Sans SC, JetBrains Mono (OFL) + tested pairing
libraries/prompts/       prompt patterns: new concept, refine, material, wordmark, application
libraries/applications/  announcement 1200×630, story 1080×1350, cover 1600×900 + renderer
scripts/                 skill checks, release manifest validator, token checks, tokens → brand.json, application measurement, self-test, renderer tests
vendor/theme-extract/    verbatim copy of the token generator and profile-2 format docs (SOURCE.json pins upstream commit and SHA-256)
agents/openai.yaml       display metadata for Codex
AGENTS.md                maintenance rules for editing the skill itself
```

Every pack includes `STYLE.md`, `EXAMPLES.md`, `PROMPTS.md`, `generated.json`, `REFERENCES.md` and `sources.json`; packs with original studies also include `originals.json`. All 12 styles have at least 10 images, totaling 152 AI studies with a [restrained art direction](libraries/styles/ART-DIRECTION.md). Third-party sources, reinterpretations and independent original studies are labelled separately. Packs remain `provisional`: static studies do not establish real brand adoption, complete brand transfer, font use, production geometry or product integration.

| Pack | Method |
| --- | --- |
| `pixel-grid-identities` | discrete units, pixel families and grid composition; Mistral and MediaViz |
| `editorial-typographic-systems` | typography roles, content hierarchy and hand-drawn conceptual illustration, studied through Anthropic, Perplexity, Notion and Intercom |
| `modular-responsive-identities` | fixed identity with composable variations, studied through Cohere and Slack |
| `parametric-science-visuals` | generated surfaces and boundary fields, studied through Secondmind and Covariant |
| `semantic-tech-marks` | letters fused with product meaning, for software and AI brands |
| `modern-product-wordmarks` | product wordmarks with local letter edits |
| `folded-ribbon-paths` | folded ribbons and continuous paths |
| `geometric-letter-monograms` | geometric letters and monograms |
| `geometric-negative-space` | holes, side cuts and shared edges |
| `monochrome-product-marks` | monochrome product imagery |
| `modernist-corporate-symbols` | modernist corporate symbols |
| `monoline-contour-marks` | monoline and contour marks |

## Install

The repository includes source references, generated studies and font files; a shallow clone is recommended.

Claude Code, available in every project:

```sh
git clone --depth 1 https://github.com/Bearisbug/visual-system.git ~/.claude/skills/visual-system
```

Claude Code, one project only: clone into `<project>/.claude/skills/visual-system`. For other agents that read `SKILL.md` skills, put the folder in that agent's skills directory.

## Requirements

| Tool | Needed for |
| --- | --- |
| Node.js 20+ (22+ for `check-application`) | `check.sh`, validators, application renderer |
| uv (Python 3, stdlib only) | the vendored token generator and `check-tokens` |
| `xmllint` | SVG parsing in checks |
| ImageMagick 7 (`magick`) | `check.sh --deep` and PNG/alpha checks in release validation |
| `rsvg-convert` or a browser | rasterizing SVG masters to PNG; ImageMagick's built-in SVG renderer drops strokes and styles |
| A Chromium-family browser | `check-application` slot measurement and 1x PNG export (looks up Playwright's chromium-headless-shell, then Chrome / Chromium, then Edge); previewing templates, where visual inspection uses Edge when available, otherwise record the actual browser |
| An image generation tool (optional) | raster exploration and material studies; vector masters are built directly as SVG |

## Usage

Ask the agent in plain language, for example:

- "Use visual-system to explore three logo directions for Tidepool, a note-taking app for researchers."
- "Keep the geometry of direction B v2 and only try a muted green palette."
- "Build the SVG master for the selected mark and export the SVG, PNG and favicon set."
- "Turn our brand guide into design tokens and a font config for our web app, with button state examples."
- "Build a complete design system from the chosen logo so our marketing images and our frontend read the same tokens."

## Validation

Run from the skill root:

```sh
./check.sh                                          # skill resources: links, rule cards, catalog, sources, SHA-256
./check.sh --deep                                   # also decode raster files
node scripts/validate-release.mjs /abs/path/to/release/manifest.json
node scripts/self-test.mjs --output /abs/path/to/validation-results.json
node --test scripts/test-application-renderer.mjs
node scripts/check-application.mjs /abs/path/to/application-output   # exits 2 (not_run) without a browser
node scripts/check-tokens.mjs /abs/path/to/brand --lint /abs/path/to/example.css
```

Each command prints JSON and exits 0 on a mechanical pass. A pass does not prove visual quality, originality, font loading or license validity.

## License

Original text, scripts, templates and the logo are released under the [MIT License](LICENSE). Bundled fonts (SIL OFL 1.1), third-party references and AI studies incorporating third-party marks are addressed separately; see [NOTICE](NOTICE.md). Copyright owners can open an issue to request removal or corrected attribution.

The logo nests one rounded square three times, as the bowl, the counter and the accent, so a single master holds at every scale.
