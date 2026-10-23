# tokens-projection.md — `scripts/build_tokens.py` inputs → outputs

`build_tokens.py` is the **resolver + projector**: the SOLE author of every consumable file. Nothing
downstream is hand-edited. uv-managed, stdlib only (no network/CV), consistent with the skill's other
scripts.

```
uv run --quiet python scripts/build_tokens.py <design-system-dir> --emit <target> [--css-unit rem|px] [--allow-dup-primitive]
```

`<target> ∈ css | design-frontmatter | resolved | tailwind | shadcn | all` — the full implemented set (`build_tokens.py` `--emit` `choices`). Swift / Android targets are **规划中,当前未实现** — see "Planned targets" at the end of Stage 3.

---

## Inputs

- `tokens.json` — the typed/aliased base graph (primitive + semantic + component).
- `modes/<mode>.json` for each `meta.modes` entry (or inline `modes` for tiny sets).
- `themes/<theme>.json` for each `meta.themes` entry.
- `meta.units`, `meta.defaults`, the `meta.extensions` namespace.

## Pipeline

### Stage 0 — VALIDATE (fail closed before emitting anything)
1. JSON parses.
2. **DTCG validity** — every leaf resolves a `$type` (own or inherited group), `$type ∈` the 10
   allowed; every leaf has a `$value`. ERR otherwise.
3. **Unitless guard** — no `$value` carries a unit suffix `/\d(px|pt|dp|rem|sp|ms)\b/`. ERR.
4. **Tier purity** — every `semantic.*` measured-role leaf (`color/space/radius/typography/
   elevation/gradient`) is an `{alias}` (or composite of aliases); a literal is an ERR. Scaffold
   groups (`state/motion/opacity/layout/density/material`) are exempt.
5. **FAIL on un-aliased dup** — two `primitive.color.*` leaves sharing an identical hex ⇒ **build
   FAIL**. Override with `--allow-dup-primitive` only for
   genuinely-distinct-but-equal values. A literal appearing in `semantic` that equals an existing
   primitive is the same failure surfaced earlier by rule 4 (it should have been the alias).
6. **Alias integrity** — every `{dotted.path}` resolves to a leaf; cycle-detect; dangle = ERR.
7. **Parity** — each `modes/*.json` / `themes/*.json` leaf-path set ⊆ base `semantic` leaf-path set.
8. **profile-2 gates** (only when a profile-2 feature is declared — tokens-schema.md §10): `[profile]` spec names profile-2; `[roles]` known keys, typed leaf targets or `{status, reason}`, `state.*` opacity 0..1; `[categories]` all 14 declared, reasons, `notApplicable` only for optional ones, present ⇒ required roles/scale leaves/complete typography steps/weights in the set; `[notUsed]` ids, notes, `css` keys, compiling `valuePattern`; `[languages]` BCP 47; `[langOverrides]` fields ⊆ fontFamily/lineHeight/letterSpacing, unitless, aliases resolve.

### Stage 1 — RESOLVE (per variant)
- Apply group-default `$type`/`$extensions` inheritance.
- For each `(mode, theme)`: `composed = base ∘ mode-override ∘ theme-override` (deep-merge; overrides
  touch only `semantic`, so `component` re-resolves automatically).
- Resolve every `{alias}` transitively to a concrete leaf (composite sub-fields resolve
  independently), yielding a flat `path → resolved $value` map per variant. Leaf detection = "node
  has `$value`"; never recurse into `$value`/`$type`/`$extensions`.

### Stage 2 — UNITIZE
Per dimension, by `scaling` + `meta.units`:
- `ratio` → bare number (every platform).
- `scalable` → web `value/remBase` + `rem` (or `px` under `--css-unit px`); iOS `pt`; Android `sp`
  (type) / `dp`.
- `absolute` → web `value` + `px`; iOS `pt`; Android `dp`.
- `duration` → `value` + `meta.units.timeUnit` (150 → `150ms`).
Composites expand at emit time only: shadow → `box-shadow` / `NSShadow` / elevation dp; gradient →
`conic|linear-gradient(...)` from `geometry`/`angle`/stops; typography → font shorthand or per-axis vars.

### Stage 3 — EMIT

**`tokens.css`** (`--emit css`) — mode-layered custom properties:
- light set → `:root { --<kebab-resolved-path>: <unitized>; }`
- dark set → SAME var names, dark values, inside both `@media (prefers-color-scheme: dark)` and
  `[data-theme="dark"]` (deltas only).
- default-mode re-assert → `[data-theme="<defaultMode>"] { … }` re-stating the base values of every
  var some non-default mode changes, emitted AFTER the `@media` blocks so a manual default-mode
  opt-in (e.g. `data-theme="light"`) beats the OS preference in both directions. Absent for
  single-mode sets.
- theme set → `[data-theme="sleep"] { … }` (deltas only).
- composites assembled to CSS HERE and ONLY here (shadow → `0 1px 3px #14141E0F`; gradient
  `strainRing` → `conic-gradient(...)`; typography split into `--type-body-size/-weight/-line-height/-family`).
- a mode override's `$coverage.notCaptured` list projects as a `/* mode "<m>" — NOT captured
  (values inherit base, unverified) */` comment, so the application side can tell "inherits base
  on purpose" from "extraction missed it". Undeclared, un-overridden `semantic.color` leaves raise
  a build-time `WARN [coverage]` on stderr (advisory, never fatal).
- profile-2 `langOverrides` → right after the base `:root`, one `[lang]:not(:lang(<lang>))` block per
  language re-asserting base values, then one `[lang]:lang(<lang>)` block per language re-pointing
  the typography per-axis vars of every leaf with an effective override (tokens-schema.md §10.4).
  Absent when no leaf declares one.
- `tokens.css` contains ONLY the custom-property layers above — the framework adapters live in
  their own generated files (below), never inline here.

**`tokens.tailwind.css`** (`--emit tailwind`) — Tailwind v4 adapter, a `@theme inline` block of
var() references INTO tokens.css (which it `@import`s): `--color-<flat>` for every color with a
PATH→FLAT home, `--radius-<seg>` for `semantic.radius.*`, `--font-<seg>` for fontFamily leaves, and
the scale entries both adapters share:
- `--text-<step>` for each `semantic.typography.<step>` size, plus the sub-keys
  `--text-<step>--line-height`, `--text-<step>--letter-spacing` and `--text-<step>--font-weight`,
  each written only when the step has that field;
- `--shadow-<name>` for each `semantic.elevation.<name>` shadow;
- `--ease-<name>` for each `semantic.motion.easing.<name>` and `--transition-duration-<name>` for
  each `semantic.motion.duration.<name>`.

Tailwind's `text-<step>` utility sets font-size, line-height, letter-spacing and font-weight from
those sub-keys, and its `duration-*` utility reads the `--transition-duration` namespace, so a
`--duration-*` variable would not be used (both checked in tailwindcss 4.3.3 `dist/lib.js`). Motion
leaves outside `semantic.motion.duration` / `semantic.motion.easing` and the unmapped groups
(categorical, dataViz gradients, spacing) stay reachable through the raw tokens.css vars. Because
values are var() refs, modes/themes cascade with zero per-mode duplication.

**`tokens.shadcn.css`** (`--emit shadcn`) — shadcn/ui adapter: a `:root` block wiring the shadcn
conventional variables (`--background`/`--foreground`/`--primary`/…/`--ring`/`--radius`) to the
theme's semantic vars through the fixed candidate chains in `SHADCN_MAP` (first existing,
type-matching base leaf wins; a miss emits a `/* --x: no mappable token */` comment, never a
guess), plus the standard Tailwind v4 `@theme inline` bridge, the `--radius-sm/md/lg/xl` ladder
and the same `--text-*`, `--shadow-*`, `--ease-*` and `--transition-duration-*` entries as the
Tailwind adapter. Each ladder step maps to `semantic.radius.<step>` when the set defines that leaf.
A step the set lacks takes the nearest defined step (the lower one on a tie) shifted by shadcn's
spacing, sm = lg − 4px, md = lg − 2px, xl = lg + 4px, so a set with only sm/md/lg gets
xl = lg + 4px. When defined steps sit on both sides of a missing step, `min()`/`max()` hold it
between them, so sm ≤ md ≤ lg ≤ xl whenever the defined steps are in order. A set that defines
none of the four uses `--radius` as lg (sm `calc(var(--radius) - 4px)` … xl
`calc(var(--radius) + 4px)`). `SHADCN_MAP` is a byte-stability contract like PATH_FLAT_COLORS — extend, don't reorder.
`--chart-1…5` map to `semantic.color.dataViz.series.1…5` (tokens-schema.md §6.3) and are optional:
a missing series leaf writes no line at all — no comment — so the adapter of a set without
`dataViz.series` contains no chart line.
A project imports exactly ONE adapter (tailwind OR shadcn), never both (each `@import`s tokens.css).

**`DESIGN.md` frontmatter** (`--emit design-frontmatter`) — resolve the LIGHT semantic+component
layers, then rename through the fixed PATH→FLAT map:
`semantic.color.action.primary→primary`, `…text.onAction→on-primary`, `primitive.color.neutral.N→neutral-N`,
`semantic.color.feedback.{success,error,…}→same`, `…text.*→text-*`,
`…surface.{background,raised,overlay}→surface-bg/raised/overlay`, `…border.*→border-*`,
`…dataViz.metric.X→chart-X` (gradient metric → `chart-X-from`/`chart-X-to`, never flattened),
`semantic.radius.pill→rounded.full`, `component.button.primary.height→size.button-height`,
theme deltas → `sleep-*`. Frontmatter dimensions emit `"<n>px"`; `lineHeight` emits the unitless
ratio (already a ratio in source — no division); colors resolve to literal hex. `components:` re-emit
with the body's self-referential `{colors.primary}` dialect. The 8-section prose BODY is authored
once and carried through unchanged. **The PATH→FLAT map is the single contract that keeps DESIGN.md
byte-stable and check.sh green**; its source is `PATH_FLAT_COLORS` plus the dynamic rules in
`build_frontmatter` (`build_tokens.py`).

**`tokens.resolved.json`** (`--emit resolved`) — the de-aliased snapshot. A full copy of the TIERED
base graph with every leaf `$value` resolved to its concrete value (aliases substituted transitively;
`$type` / `$extensions` / `$description` kept — `build_resolved_tree` in `build_tokens.py`), for plain
readers that want concrete values without running the resolver (`contrast.py audit` reads it).
For profile-2 sets the base file also carries `meta.resolvedMode`, each typography leaf carries its
effective `langOverrides` de-aliased, and every non-default mode with an override file gets its own
`tokens.resolved.<mode>.json` (mode applied, `$coverage` dropped, `meta.resolvedMode = "<mode>"`).

### Planned targets — 规划中,当前未实现

The following targets do NOT exist in `scripts/build_tokens.py` (its `--emit` `choices` are exactly
`css | design-frontmatter | resolved | tailwind | shadcn | all`). The unitless-source + `scaling`-facet model is designed so each remaining target
would be a pure function of `(resolved map, target unit policy, scaling facet)` — but until
implemented, none of these can be invoked, and today's unitize stage emits **web units only**
(px / rem via `--css-unit`; the pt / dp / sp mappings in Stage 2 describe the intended policy):

- **`swift`** — `Tokens.swift`: `Color(hex:)` + `CGFloat` (value as pt); modes as asset-catalog-style
  light/dark pairs.
- **`android`** — `colors.xml` + `dimens.xml` (value→dp, type→sp); `values-night` for dark.

---

## What centralizes here (and the risk)

`build_tokens.py` is the single enforcement point for typing, units, tiers, and anti-drift, and the
single author of consumables. A broken build blocks ALL outputs — accepted, because it is also the
one place the contract is mechanically guaranteed. `check.sh` calls it as the **anti-drift oracle**:
it diffs the committed `DESIGN.md` frontmatter and `tokens.css` against `build_tokens.py --emit`, so
the projector — not a bespoke color-equality block — is the source of truth for "did a value drift".
