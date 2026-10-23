# tokens-schema.md — the portable design-extract token contract (canonical; `com.design-extract` and `design-extract/profile-N` are frozen format identifiers, independent of the skill name — never change them)

`tokens.json` is a **typed, aliased DTCG graph that is INPUT to a resolver**, not a flat hand-read
lookup. Every consumable file (`tokens.css`, `tokens.tailwind.css`, `tokens.shadcn.css`, `DESIGN.md`
frontmatter, `tokens.resolved.json`) is a generated projection — never hand-authored; Swift and Android
projections are planned, not implemented (see tokens-projection.md "Planned targets").

Core decisions: three tiers plus portable groups under `semantic`; the reverse-domain
`com.design-extract` namespace declared in `meta.extensions`; `meta.defaults` as the facet backstop and
the leaf-walker definition; the FAIL-on-duplicate-primitive anti-drift invariant; `captureScale`,
per-mode elevation `strategy` and `timeUnit`; and the `tokens.resolved.json` tiered de-aliased snapshot
(see tokens-projection.md).

---

## 1. DTCG profile

Spec base: DTCG-1.0, declared in `meta.spec = "DTCG-1.0 + design-extract/profile-1"`. Profile-2 (`design-extract/profile-2`) is an additive superset for full design-system declarations — §10.

**Every leaf** is a DTCG token object: `{ "$type", "$value", "$description"?, "$extensions"? }`.

**`$type` ∈ the 10 allowed types** (a leaf with any other `$type` is an ERR):
`color | dimension | number | fontWeight | fontFamily | duration | cubicBezier | shadow | gradient | typography`.

**Group nodes carry defaults that children inherit** (standard DTCG `$type` cascade, extended to
`$extensions`): a group may set `$type` and an `$extensions["com.design-extract"]` facet block once;
descendant leaves inherit both from the nearest ancestor that declares them, overriding only where
they differ. This keeps a 11-step ramp from repeating `"$type":"color"` eleven times. (The
`$extensions` cascade is a profile convention beyond DTCG, which only mandates the `$type` cascade —
non-aware tooling sees facets only where literally declared; our own `build_tokens.py` is the
consumer, so this is acceptable. Declared in `meta.spec`.)

**Composite types are STRUCTURED objects, never CSS strings.** CSS strings exist only as projection
OUTPUT.
- `shadow` → `{ "color", "offsetX", "offsetY", "blur", "spread" }`
- `gradient` → ordered `[ { "color", "position" }, … ]` + `$extensions` `geometry`/`angle`/`scale`
- `typography` → `{ "fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing"? }`, each
  field an alias or literal.

### Deliberate deviation — unitless dimension

Strict DTCG-2024 wants `dimension.$value = { value, unit }`. **This profile makes `$value` a bare
number** in one reference unit (≈ CSS px ≈ iOS pt @1x). Likewise `duration.$value` is a bare number
read as `meta.units.timeUnit`. Units are an **export-time decision** resolved from `meta.units`, not
a property of the source — that is the whole portability feature: one phone capture can emit a rem web
scale, a pt iOS scale, and a dp Android scale with no per-platform re-authoring (web emit implemented
today; pt-iOS / dp-Android belong to the planned targets in tokens-projection.md).

Enforcement: a leaf `$value` containing a unit suffix (`/\d(px|pt|dp|rem|sp|ms)\b/`) is an ERR.
Cost: generic DTCG tooling (Style Dictionary, Tokens Studio) won't ingest the *source* as-is — feed
them the post-resolve `tokens.resolved.json`/`tokens.css` export, or a tiny `meta.units` adapter.
Isolated to this one rule and declared in `meta.spec`.

---

## 2. The three tiers + the no-literal-duplication invariant

```
primitive → semantic → component
```

- **primitive** — the ONLY place a raw hex/number/array may appear. Measured ramps, raw dims, font
  sizes, durations, easings, opacities. **A primitive leaf is the single source for one distinct
  measured value.** Two primitive color leaves sharing an identical hex is a **build FAIL** (escape:
  `--allow-dup-primitive`).
- **semantic** — measured-role groups (`color`, `space`, `radius`, `typography`, `elevation`,
  `gradient`) MUST be an `{alias}` into `primitive` (or a composite whose sub-fields are aliases). A
  literal here is an ERR. **This is the only layer modes/themes re-point.**
- **component** — recipes. Alias `semantic` first; may dip into `primitive` ONLY for raw geometry
  with no semantic home (e.g. button `height → {primitive.dimension.control.54}`); may alias
  `semantic.state`/`semantic.motion` for interaction.

**Scaffold-group carve-out.** The inferred/convention portable groups — `semantic.state`,
`semantic.motion`, `semantic.opacity`, `semantic.layout`, `semantic.density`, `semantic.material` —
MAY hold literal values, because they are platform-convention scaffolding with no measured primitive
behind them (a 44pt touch target, an 8% press overlay, a 768 breakpoint). They are exempt from the
must-alias rule and ship `scope:inferred|invariant`, `confidence:inferred`. They may still alias a
primitive when one genuinely exists (e.g. `state.disabled.opacity → {primitive.opacity.disabled}`).

**Worked de-dup (real Bevel):** `primitive.color.neutral.200 = #ECECF1`; both
`semantic.color.border.subtle` and `semantic.color.dataViz.track` are `{primitive.color.neutral.200}`.
One edit moves both; drift is impossible.

---

## 3. Alias model

DTCG `"{dotted.path}"` references, as a leaf `$value` OR inside a composite (gradient stop `color`,
typography `fontFamily`/`fontSize`/…). Resolution walks to a leaf and substitutes its resolved
`$value`, transitively. Cycles and dangling refs are build errors.

- `primitive.*` never aliases (the literal floor).
- `semantic.*` measured roles always alias `primitive`.
- `component.*` aliases `semantic`, or `primitive` for raw geometry only.
- modes/themes re-point `semantic` aliases ONLY — they never restate primitives and never touch
  `component`, which re-resolves through the overridden semantic layer for free.

**Leaf definition (the load-bearing rule for both resolver and check.sh):** a node is a LEAF at its
path iff it carries a `$value`. The walker stops there and never recurses into
`$value`/`$type`/`$extensions`/`$description`. Group nodes are every node above a leaf. This single
definition powers alias resolution, the mode-parity subset check, and the principles.md ref
resolver.

---

## 4. `meta` block

```json
"meta": {
  "app": "Bevel", "source": "screenshots",
  "spec": "DTCG-1.0 + design-extract/profile-1",
  "tiers": ["primitive","semantic","component"],
  "extensions": "com.design-extract",
  "modes": ["light","dark"], "defaultMode": "light", "modeModel": "light-primary", "themes": ["sleep"],
  "medium": "phone", "platform": "ios",
  "units": { "base":4, "spaceUnit":4, "sizeBasis":1, "remBase":16,
             "captureScale":3, "timeUnit":"ms", "reference":"…" },
  "defaults": { "scope":"capture-bound", "scaling":"absolute", "confidence":"measured" }
}
```

`meta.units` is the unit-resolution contract — the single place that turns the unitless source into
platform units:
- `base` (4) — grid quantum; `primitive` space/size `$value`s are multiples of it unless flagged
  off-grid (carry pre-snap `raw` in `$extensions`).
- `spaceUnit` (4) — space-step quantum (a NUMBER, the grid unit — not an export-unit string; export
  unit is decided by the `scaling` facet + the per-target unit table, never here).
- `sizeBasis` (1) — 1 reference px = 1 design unit at @1x. **Platform-aware:** MAY be a per-platform map
  (`{ "web":1, "ios":1, "android":1 }`) when one capture targets several platforms. Detect the
  `meta.medium` (phone/tablet/desktop) and `meta.platform` (iOS/Android/web) FIRST, then pick the
  calibration anchor (44pt iOS / 48dp Android / sidebar-width + known control heights desktop); a bare
  number is the single-platform shorthand. Framing and touch-target conventions are likewise
  platform-aware — the phone/iOS framing (status bar, 44pt, bottom tab bar, single column) is NOT
  universal.
- `remBase` (16) — reference-px per rem and the rem/px boundary for web.
- `captureScale` (3) — native @3x pixels were divided by this before recording, so the capture is
  platform-neutral, not a 3× phone clone.
- `timeUnit` ("ms") — unit applied to bare `duration` values.
- `reference` — prose note pinning the reference unit.

`meta.sourceNote` (optional string) — one prose line on the capture set: how many screenshots, where
they came from, native size and scale, anything excluded. It is provenance for readers, not a token;
per-value evidence still goes in the leaf-level `source` / `provenance` strings (§5).

`meta.modeModel` is the **DETECTED mode topology** — one of
`light-only | light-primary | light-dark-peer | dark-primary` (detect first; default to `light-primary`
only when topology is undetectable):
- `light-only` — no dark mode captured.
- `light-primary` — a light base with a dark delta; `defaultMode = light`.
- `light-dark-peer` — two co-equal measured modes, neither derived from the other.
- `dark-primary` — **dark IS the base/only mode.** Do NOT assume a light base to derive from: the dark
  ramp is the measured primitive floor (`primitive.color.neutral.*` measured dark), `defaultMode = dark`,
  and any light mode (if present) is the delta.

`meta.defaults` is the **global facet backstop**: any leaf whose facet isn't set on itself or an
ancestor group resolves it here. Confidence is a per-leaf facet (§5).

---

## 5. Facets — `$extensions["com.design-extract"]`

Three orthogonal facets per token, resolved by inheritance (own leaf → nearest ancestor group →
`meta.defaults`):

**`scope`** — portability origin (what changing the app/platform does to the value):
`invariant` (system constant: white, 44pt touch, pill 999, scrim) ·
`capture-bound` (THIS app's measured fingerprint: brand hex, measured ramp, control height 54) ·
`derived` (deterministic function of measured anchors: ramp mids, base-4 snaps, projected
breakpoints, semantic aliases) ·
`inferred` (convention expansion, nothing on screen: motion, focus ring, hover overlay). Lowest trust.

**`scaling`** — export-unit policy:
`absolute` (never multiplied — hairline, icon stroke, shadow blur, fixed control height → px/pt/dp
as-is) · `scalable` (grows with density/text-size — space, font size, touch targets → rem on web) ·
`ratio` (unitless pass-through — lineHeight, type-scale ratio, density multipliers, opacity).

**`confidence`** — evidence tier, mirroring the flow-analyze honesty spine, per leaf:
`measured | derived | inferred`. Optional `source`/`provenance`
string carries the crop note ("--accent crop img520").

`scope ≠ confidence`: `radius.pill = 999` is `scope:invariant` but `confidence:inferred` (you saw
round pills, not the literal 999). A brand hex is `scope:capture-bound, confidence:measured`. Keeping
both lets the projector ask "is this the app's fingerprint?" separately from "did we see it?".

**Type-specific facets** (also in the same `$extensions` block):
- `gradient` → `geometry ∈ linear|conic|radial`, `angle`, `scale ∈ sequential|diverging|categorical|ambient`
- `radius` → `cornerStyle` = the DETECTED radius/shape intent, a FIRST-CLASS enum
  `sharp (~0–2) | subtle (~4–8) | soft (~10+) | squircle` (iOS continuous corner). **Detect it; default only
  when no rounded surface is visible.** `subtle` is its own tier, NOT a rounding of `soft`. Legacy geometry
  values `round | continuous | cut` are accepted synonyms (`round`→`soft`, `continuous`→`squircle`, `cut` =
  beveled). `smoothing` (0–1, iOS
  squircle amount; ignored off-iOS). **0-radius is allowed** — data grids/tables legitimately use 0-radius
  cells; there is NO "interactive controls must never be 0-radius" rule. Record `cornerStyle` on the
  `semantic.radius` group (children inherit it).
- `elevation` → `strategy { light: "shadow", dark: "border+fill" }` (per-mode depth tactic)
- `typography` → `stepIndex`, `fontVariantNumeric`, `measure` (target line length in ch)
- `space`/off-grid → `raw` (pre-snap measurement), `note`

A reviewer audits guesses with `grep '"confidence": "inferred"'` instead of reading a hand-maintained
name list.

---

## 6. Group map

**Detection-first (the spine of this profile): DETECT INTENT BEFORE DEFAULTING.** Every group below is
something to *detect* from the captured app, not a fixed shape to impose. Default only when a thing is
truly undetectable. Several groups are CONDITIONAL — present only when the app actually has the feature
(`categorical` only with a tag/status/syntax system; `material` only with translucent/code surfaces).
Never force a conditional group, and never cram a status-enum or tag system into the four fixed
`feedback` slots or into `dataViz`. `dataViz` is conditional in screenshot extraction: present when the
screenshots show charts, absent (never forced) when they show none. Design generation (visual-system)
emits `dataViz` by default — §6.3.

### primitive (literals only)
- `color` — `neutral.{0…900}`; `brand.{ink, accent?}` (accent optional — see §6.2 brand model);
  `metric.{…}` (one hue per tracked chart series) — **CONDITIONAL: present only when the app has charts**;
  `dataViz.{series,sequential,diverging}.<key>` + `dataVizDark.*` (the chart palettes, §6.3);
  `categorical.{…}` (one entry per tag/label/status/syntax category, each typically a `{bg, ink, dot?}`
  sub-group) — **CONDITIONAL: present only when such a system exists, and UNCAPPED** (see §6.1). `metric`
  and `categorical` are distinct hue families with different downstream homes.
- `dimension` — `space.{1,2,3,…}` (base-4 multiples), `control.{54}`, `hairline`, `radius.{pill,…}`,
  `fontSize.{title,body,…}`.
- `fontFamily` · `fontWeight` · `ratio.lineHeight.{…}` · `duration.{…}` · `easing.{…}` · `opacity.{…}`.

### semantic (measured roles alias primitive; scaffold groups may hold literals)
- `color` — `text.*`, `surface.*`, `border.*`, `action.*`, `feedback.{success,warning,error,info}` (the
  FOUR fixed semantic slots — NEVER overload them with an open tag/status enum), `categorical.*` (the home
  for tags/labels/status-enums/syntax — N-ary, UNCAPPED; see §6.1), `dataViz.{track,gridline,axis,metric}`
  plus the palettes `dataViz.{series,sequential,diverging}` (§6.3) — **in screenshot extraction present
  ONLY when the screenshots show charts, ABSENT (never forced) otherwise; design generation emits it by
  default** (`track`/`gridline`/`axis` re-alias the neutral ramp).
- `space` — named roles `screenMargin`, `cardInset`, `stack` (one-offs pulled OUT of the numeric scale).
- `radius` (+ `cornerStyle`/`smoothing`) · `typography.*` composites · `elevation.*` shadow composites (+ per-mode `strategy`) · `gradient.*` stop arrays (+ `geometry`/`scale`).
- **Portable scaffold groups** (the cross-platform layers a single phone can't show):
  - `layout` — `breakpoint.{sm,md,lg,xl}`, `contentMax`, `columns`, `gutter`, `screenMargin`, `touchTarget.{touch:44,pointer:32}`.
  - `density` — `{comfortable,compact}.{control,gap}` RATIO multipliers (`scaling:ratio`, `scope:inferred`).
  - `state` — `hover/pressed/focus/disabled/selected` as overlay-rgba / opacity / scale TRANSFORMS + focus ring; never measured per-component hexes.
  - `motion` — `duration` (ms) + `easing` (cubicBezier) + `reducedMotion` (number 0–1). Under
    `prefers-reduced-motion: reduce`, `reducedMotion` applies to movement only: it multiplies the
    distance and duration of translate, scale and spring animations, while opacity and color
    transitions keep their `duration` values. `0` removes movement and leaves fades and color
    changes intact; it never zeroes the `duration` tokens.
  - `opacity` — numeric 0–1 scale (disabled, scrim, muted) consumed by `state.*`.
  - `material` (optional) — `{ blur: dimension, tint: color, … }` per named material, structured, not a
    `backdrop-filter` string. Covers translucent / frosted surfaces (iOS vibrancy) **AND code-block /
    frosted-panel materials** (e.g. `material.frosted`, `material.codeBlock`). Present only when such
    surfaces exist.

### component (recipes)
- `button.{primary,…}`, `card`, `input`, … each sub-token a `{...}` reference to semantic (or
  primitive for raw geometry).

### 6.1 `semantic.color.categorical` — tags / labels / status-enums / syntax (N-ary, UNCAPPED)

A sibling of `dataViz`, but a DIFFERENT thing. `dataViz` is a metric palette / gradient / ring read off
charts (and is CONDITIONAL). `categorical` is the open set of identity colors for tag chips, label pills,
status enums **beyond** the four fixed `feedback.{success,warning,error,info}` slots, and
syntax-highlighting tokens. Use it whenever the app has such a system; otherwise omit it.

- **N-ary and UNCAPPED.** One named entry per category — `priority.high`, `status.shipped`, `tag.design`,
  `syntax.keyword`, …. There is NO fixed count. Do NOT squeeze a status-enum or tag set into the four
  `feedback` slots, and do NOT route it through `dataViz`.
- **Each entry is a PAIR (or triple), not one flat fill.** Categorical colors are usually a tinted
  background + a saturated foreground (tinted pill + darker ink), so sample/store them as a pair:
  ```
  semantic.color.categorical.<name> = {
    "tint": { "$type":"color", "$value":"{primitive.color.categorical.<name>.bg}"  },  // pill/chip background
    "text": { "$type":"color", "$value":"{primitive.color.categorical.<name>.ink}" },  // label text on the tint
    "dot":  { "$type":"color", "$value":"{primitive.color.categorical.<name>.dot}" }   // optional status dot / swatch
  }
  ```
  (`bg` is an accepted synonym for `tint`, `ink` for `text`; `dot` optional.) Each is a color leaf that
  aliases `primitive.color.categorical.*` — the semantic must-alias rule still holds; a literal here is an
  ERR.
- **Per-mode light/dark variants.** Each entry re-points per mode through the normal override mechanism
  (`modes/dark.json`): a light tint+ink pair flips to a dark-surface tint+ink pair. Dark-only categorical
  hues get their own `primitive.color.categoricalDark.*` ramp (same pattern as `neutralDark`), keeping dark
  tier-pure.
- **Primitive home.** Hues live under `primitive.color.categorical.<name>.{bg,ink,dot}` — uncapped, sibling
  of the (conditional) `metric.*` chart family.

### 6.2 Brand color model — detect monochrome vs accent-driven

Detect which model the app uses BEFORE assigning `brand`:
- **Monochrome** — no saturated hue carries the brand identity (any saturated hues present are status /
  syntax / tag / chart colors). The brand IS the darkest neutral ink: `primitive.color.brand.primary` = the
  ink (or an alias of the neutral ramp's darkest step) and `brand.accent = null`. Most captured apps are
  monochrome.
- **Accent-driven** — a single saturated hue is the identity (bevel's orange): `brand.primary` = ink for
  fills, `brand.accent` = that hue.
- **Null-accent trigger:** set `accent = null` when **no saturated hue is the brand
  identity**, whether the saturated hues are chart colors or a status / syntax / tag system.

### 6.3 `semantic.color.dataViz` palettes — series, sequential, diverging

Three ordered palettes sit beside `track` / `gridline` / `axis` / `metric`. Each is a group of color
leaves keyed by consecutive integers from `1`:

| Group | Keys | Order | Use |
| --- | --- | --- | --- |
| `series.<n>` | `1…N`, default N = 6 | plotting order; `series.1` is the first series | categorical series: lines, bars, slices |
| `sequential.<step>` | `1…N` | low → high magnitude | single-hue intensity: heatmaps, choropleths |
| `diverging.<step>` | `1…N`, N odd | negative pole → neutral middle step → positive pole | values above / below a reference |

- **Tier purity holds.** Each leaf aliases a primitive. The hues live under
  `primitive.color.dataViz.{series,sequential,diverging}.<key>`, dark-mode hues under
  `primitive.color.dataVizDark.*` (same pattern as `neutralDark`). A step whose hex already exists as a
  primitive aliases that primitive instead of adding a copy — the duplicate-primitive gate fails on a
  second leaf with the same hex. Typical cases: `series.1` is the accent itself (when the accent passes
  the lightness and chroma checks below), the diverging middle step is a neutral.
- **Per mode.** `modes/<mode>.json` re-points every palette leaf to that mode's hues (light and dark
  each get their own set); a leaf left un-re-pointed shows the base hue on the other mode's surfaces.
- **Series distinctness.** A `series` set a producer derives passes every check below in every mode.
  ΔE is the Euclidean distance in OKLab ×100. The lightness band, chroma floor, simulation model and
  the color-vision-deficiency (CVD) and normal-vision floors are those of the categorical-palette
  validator in Claude Code's bundled `dataviz` skill (`scripts/validate_palette.js`, checks 2–5); the
  feedback floor reuses its normal-vision floor.

  | Check | Requirement |
  | --- | --- |
  | Lightness | OKLCH L inside the mode band: light 0.43–0.77, dark 0.48–0.67 |
  | Chroma | OKLCH C ≥ 0.10 |
  | Contrast | ≥ 3:1 (WCAG) against each of the four surface roles of that mode |
  | CVD | adjacent slots `n` and `n+1`, protanopia and deuteranopia simulated with Machado, Oliveira & Fernandes (2009) at severity 1.0, the smaller ΔE of the two: ≥ 8 passes; 6–8 passes only when the group's `$description` requires secondary encoding (direct labels, gaps or texture) wherever adjacent series meet; < 6 fails |
  | Normal vision | worst adjacent pair ΔE ≥ 15 |
  | All pairs of `series.1`–`3` | each of the pairs 1–2, 1–3 and 2–3 meets the CVD and normal-vision requirements above |
  | Feedback | every series color against each of `feedback.success`, `feedback.warning` and `feedback.error` of the same mode: ΔE ≥ 15 |

  Scatter, bubble and small-multiple charts can put any two series side by side, so they compare
  all pairs and use at most three series, `series.1`–`3`; a fourth series folds into "Other" or a
  separate facet (the same `dataviz` skill, `references/color-formula.md` check 4). The group's
  `$description` records, per mode, the worst adjacent CVD and normal-vision ΔE, the worst CVD and
  normal-vision ΔE among the pairs of `series.1`–`3`, and the worst CVD and normal-vision ΔE over
  all pairs of the full set together with the two slots that produce each (e.g. `CVD dE 3.6 (2-6)`).
  The full-set all-pairs figures are recorded for consumers that draw more series in one chart;
  no threshold applies to them.

  `series.1` is the accent only when that mode's accent passes the lightness band and the chroma
  floor; otherwise `series.1` keeps the accent's OKLCH hue with L and C re-chosen inside the band and
  above the floor. When the accent stays below the chroma floor because the brand is monochrome
  (§6.2), `series.1` and `sequential` take the OKLCH hue of the most chromatic of that mode's link,
  focus-ring (`focusRing.color`) and selection (`selection`) colors; when none of them reaches the
  chroma floor, the producer chooses the hue of `series.1` and writes it into the group's
  `$description`. A series sampled off a captured app's charts stays `measured` and is never
  re-colored; each check it fails is listed in the group's `$description`.
- **Confidence.** Hues sampled off rendered charts are `measured`. A producer that computes them from
  the brand marks them `confidence: derived` and writes the derivation rule into the group's
  `$description`, so a reviewer can recompute every step.
- **Screenshot extraction** captures a palette only when the screenshots show it. A palette bound to
  named metrics by legend labels stays `metric.*`; never invent `series` for an app whose charts the
  capture does not show.
- **Design generation** (visual-system) emits `dataViz` by default; which palettes it emits and how it
  derives them are that producer's rules. `meta.categories.dataViz = notApplicable` records a product
  without charts.
- **Projection.** `tokens.css` carries every palette leaf as `--semantic-color-data-viz-<group>-<key>`.
  The shadcn adapter wires `series.1…5` to `--chart-1…5` (tokens-projection.md); a `--chart-N` whose
  series leaf is absent is not written at all.

---

## 7. Theming — modes & themes

- **The base resolved set is `meta.defaultMode`**, which follows `meta.modeModel` (§4) — usually `light`,
  but when `modeModel = dark-primary` the base IS dark: `defaultMode = dark`, the dark ramp is the measured
  primitive floor, and any light mode is the delta. Do NOT assume a light base to derive dark from.
- **Modes** (`light`/`dark`) and **themes** (`sleep`) are PEER override files:
  `modes/<mode>.json`, `themes/<theme>.json`.
- Each override is **keys-⊆-base** at the leaf-path level and re-points **semantic** aliases only.
  A mode flips role→primitive bindings; every component and the whole graph below follow for free —
  no component token is duplicated per mode.
- **Dark-only measured colors get their own primitive ramp** (`primitive.color.neutralDark.*`,
  `scope:capture-bound`) that the dark override binds to, so even dark stays tier-pure. A raw hex in
  an override is a flagged escape hatch (`scope:capture-bound`), not the norm.
- A theme (`sleep`) is the same mechanism, delivered as a peer layer rather than a light/dark swap.
- **Modes and named themes are mutually exclusive: both select through `data-theme`.** A manual mode is
  `[data-theme="<mode>"]`, a named theme is `[data-theme="<theme>"]`, and an element holds one value —
  a page that set `data-theme="dark"` cannot also show `sleep`. Theme deltas are computed against the
  base (`meta.defaultMode`) set only and no mode × theme combination is generated, so a theme shown
  under the OS dark preference (`@media (prefers-color-scheme: dark)`) mixes dark values with the
  theme's base-mode values.

Parity is enforced: each override's leaf-path set ⊆ base `semantic` leaf-path set (checked via
the leaf-walker).

---

## 8. Honesty declarations — `meta.a11y.acknowledged` + mode `$coverage`

Two machine-readable registers keep "faithfully measured" and "actually verified" apart:

**`meta.a11y.acknowledged`** (base `tokens.json`) — the SOURCE APP itself ships a sub-AA pair and
the extraction is faithful, not wrong. A list of `{mode, fg, bg?, note}`: `mode` ∈ `light|dark|*`;
`fg` is `text.<role>` or `categorical.<name>`; `bg` is `surface.<name>` or `*` (default); `note`
is REQUIRED (what was measured). Effect: `contrast.py audit` downgrades matching essential
failures to `[acknowledged]` advisories — but an entry matching NO failing pair is **stale and
itself a failure** (fixed the token? remove the entry), and `check.sh` ERRs unless `DESIGN.md`'s
Do's and Don'ts names each acknowledged role (kebab form, e.g. `text-secondary`) with a skin-time
fix instruction (raise to ≥4.5:1). Honest declaration never waives the build guidance — the gate
moves from "block the extraction" to "block the missing instruction".

**`$coverage`** (top level of `modes/<mode>.json` only) — for base semantic leaves the override
does NOT re-point: `{"notCaptured": [paths...], "confirmedSame": [paths...]}`. Paths must be base
semantic leaves, not overridden in the same file, listed once (STAGE-0 gate h). `notCaptured`
projects into `tokens.css` as a `/* mode "<m>" — NOT captured */` comment; `semantic.color` leaves
neither overridden nor declared raise an advisory build `WARN [coverage]`. Don't declare
`confirmedSame` without a capture that shows it — that is exactly the guess this register exists
to prevent.

## 9. Projection rules (summary — full spec in [tokens-projection.md](tokens-projection.md))

The graph is read THROUGH projections. `build_tokens.py` resolves aliases to a flat
`path → resolved $value` map per (mode, theme) variant, then:
- **dimension** → unit by `scaling` + `meta.units` (`absolute`→px/pt/dp; `scalable`→rem web / sp Android; `ratio`→bare).
- **composites assembled into platform strings at emit time only** (shadow→`box-shadow`, gradient→`conic-gradient(...)`, typography→shorthand or per-axis vars).
- **flat name** = kebab of the resolved path, OR the fixed PATH→FLAT map for DESIGN.md frontmatter
  (`semantic.color.action.primary → primary`, `primitive.color.neutral.500 → neutral-500`,
  `semantic.color.dataViz.metric.strain → chart-strain-from/-to`, `component.button.primary.height
  → size.button-height`). The map keeps DESIGN.md byte-stable across runs and check.sh green.

---

## 10. profile-2 — full design-system declarations (additive)

`meta.spec = "DTCG-1.0 + design-extract/profile-2"`. Profile-2 is a strict superset of profile-1:
every feature below is optional, and a set that declares none of them builds byte-identically to
profile-1. Declaring any of them while `meta.spec` still names profile-1 is a build ERR
(`[profile]`). The features exist so that one token set can state, machine-readably, whether it
covers a complete design system — the categories a component specimen page or a design-tool
importer needs — and so producers other than screenshot extraction (e.g. visual-system) emit the
same format. Leaf names stay free; fixed vocabulary lives only in `meta.roles` and
`meta.categories`. Reference example: [profile2-example/](profile2-example/tokens.json) — a full-depth set
declaring all 14 categories, with a dark mode.

### 10.1 `meta.roles` — fixed roles → leaf paths

Maps each fixed role to the base leaf that fills it, or to an explicit
`{ "status": "missing" | "notApplicable", "reason": "…" }`. Unknown role keys, non-leaf targets,
a wrong `$type`, or a status without a reason are ERRs. `state.*` roles must resolve to an opacity
in 0..1 (the consumer draws them as a `currentColor` overlay layer). Consumers resolve a role by
reading the mapped path in `tokens.resolved.json` (or `tokens.resolved.<mode>.json`).

| Role | `$type` |
| --- | --- |
| `text.primary` · `text.secondary` · `text.tertiary` | color |
| `surface.sunken` · `surface.default` · `surface.raised` · `surface.overlay` | color |
| `accent` · `onAccent` · `selection` · `divider` | color |
| `feedback.success` · `feedback.warning` · `feedback.error` | color |
| `elevation.sunken` · `elevation.default` · `elevation.raised` · `elevation.overlay` | shadow |
| `state.hover` · `state.focus` · `state.pressed` · `state.dragged` · `state.disabled` | number (0..1) |
| `focusRing.width` · `focusRing.offset` | dimension |
| `focusRing.color` | color |
| `space.withinGroup` · `space.betweenGroups` · `space.section` | dimension |
| `radius.pill` · `radius.innerMin` | dimension |
| `hairline` | dimension |

Naming the mapped leaves on the shadcn / PATH→FLAT candidates (`semantic.color.surface.background`,
`surface.sunken/raised/overlay/selected`, `text.onAction`, `action.primary`, `border.subtle`,
`feedback.*`, `semantic.state.focus.ring`) makes the framework adapters wire them without a map.
`radius.innerMin` is the floor of the concentric rule `inner = max(outer − padding, innerMin)`.

### 10.2 `meta.categories` — every category present, notApplicable or missing

When declared, ALL of the keys below must appear, each `{ "status": "present" | "notApplicable" |
"missing", "reason"? }`. `notApplicable` / `missing` require a non-empty `reason`;
`notApplicable` is only allowed for optional categories (a required category the set lacks is
`missing`). A non-present category may not map any of its roles to a leaf. A `present` category
must satisfy its row:

| Category | Optional | Present requires |
| --- | --- | --- |
| `typography` | no | ≥1 `semantic.typography.*` typography leaf; every step resolves all of fontFamily, fontSize, fontWeight, lineHeight, letterSpacing |
| `fontWeight` | no | ≥1 `primitive.fontWeight.*` leaf; every typography step's weight is in that set |
| `color` | no | all color roles of §10.1 except `focusRing.color` declared |
| `space` | no | ≥1 `primitive.dimension.space.*` leaf; the three `space.*` roles declared |
| `radius` | no | ≥1 `semantic.radius.*` dimension leaf; `radius.pill`, `radius.innerMin` declared |
| `elevation` | no | the four `elevation.*` roles declared (a surface that casts no shadow is `notApplicable` with a reason) |
| `state` | no | the five `state.*` roles and the three `focusRing.*` roles declared |
| `motion` | no | ≥1 `semantic.motion.duration.*` duration and ≥1 `semantic.motion.easing.*` cubicBezier |
| `hairline` | no | `hairline` declared (0.5 or 1 at DPR 2) |
| `typographyDisplay` | yes | ≥1 `semantic.typographyDisplay.*` typography leaf, complete like `typography` |
| `breakpoint` | yes | ≥1 `semantic.layout.breakpoint.*` dimension |
| `zIndex` | yes | ≥1 `semantic.layout.zIndex.*` number |
| `material` | yes | ≥1 `semantic.material.*` leaf |
| `dataViz` | yes | ≥1 `semantic.color.dataViz.*` leaf |

`semantic.typography` is the UI reading scale; `semantic.typographyDisplay` is the fixed-canvas
display scale (posters, covers, hero art). Both share the font families, the weight set and the
color roles, and both are measured-role groups (must alias primitive). Only `semantic.typography`
feeds the `--text-*` entries of the Tailwind and shadcn adapters.

### 10.3 `meta.notUsed` — the "this system does not use" register

A list of `{ "id": kebab, "note": "…", "css"?: { "property"?: name, "valuePattern"?: regex } }`.
Ids are unique; `css` needs at least one of its two keys and no others; `valuePattern` must compile
and may not use `(?` constructs other than `(?:`, `(?=`, `(?!` (Python and JS regex dialects differ
there; consumers match it case-insensitively). An entry with `css` is lint-checkable by any consumer
(a declaration whose property equals `property`, vendor prefix ignored, or whose value matches
`valuePattern`, is a violation); an entry without `css` is a documented manual check (e.g. card
nesting depth).

### 10.4 `meta.languages` and typography `langOverrides`

`meta.languages` lists the BCP 47 tags the product writes in (e.g. `["zh-CN","en"]`); consumers use
it as the initial project language and set `<html lang>` from it.

A typography leaf (or group, cascading like any facet) may carry
`$extensions["com.design-extract"].langOverrides = { "<lang>": { fontFamily?, lineHeight?,
letterSpacing? } }` — aliases allowed, units forbidden, no other fields. The facet cascade replaces
the WHOLE `langOverrides` object: a leaf that declares its own does not inherit any group entry
(use that to keep a mono step out of a group-level CJK family; `{}` opts the leaf out entirely).
`tokens.css` emits, after the base `:root`, a `[lang]:not(:lang(<lang>)) { … }` block re-asserting
the base values, then a `[lang]:lang(<lang>) { … }` block re-pointing the per-axis vars
(`--semantic-typography-body-line-height`, …). Only elements that carry a `lang` attribute —
`<html lang>` or a single sample — re-declare; descendants inherit, so a container-level override
of these vars still works, and an English sample inside a Chinese page gets the base values back.
Consumers must apply the typography properties (`font-family`, `line-height`, `letter-spacing`) on
the elements that carry `lang` as well — e.g. `[lang] { font-family: var(--…-font-family) }` or a type
class on the sample itself — because an inherited `font-family` is already a computed list: setting
it once on `body` leaves an inner `lang="en"` block with the Chinese stack even though the custom
property was re-declared there.
`tokens.resolved.json` writes each leaf's effective override onto the leaf, de-aliased.

### 10.5 Per-mode resolved snapshots

For profile-2 sets, `--emit resolved` also writes `tokens.resolved.<mode>.json` for every
non-default mode that has a `modes/<mode>.json` override: the full tiered graph with that mode
applied and de-aliased, `$coverage` dropped, `meta.resolvedMode = "<mode>"`. The base file carries
`meta.resolvedMode = <defaultMode>`. Importers read these files instead of re-implementing alias
resolution and mode overlay.
