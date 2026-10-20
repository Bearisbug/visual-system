#!/usr/bin/env python3
"""build_tokens.py — resolver + validator + projector for the portable token graph.

This is the SOLE author of every consumable file in a design-system output. The
typed/aliased DTCG graph in `<dir>/tokens.json` is INPUT only; `tokens.css`,
`tokens.resolved.json`, and the `DESIGN.md` frontmatter token block are GENERATED
projections — never hand-edited. A broken build blocks ALL emits (fail closed), so
this one place mechanically guarantees typing, units, tiers, and anti-drift.

Stdlib only (json/re/sys/argparse + os for paths). No network, no Pillow/numpy, no
third-party deps — consistent with the rest of the skill's scripts being runnable
under `uv run --quiet python scripts/build_tokens.py`.

    python scripts/build_tokens.py <design-system-dir> \\
        --emit <css|design-frontmatter|resolved|tailwind|shadcn|all> \\
        [--css-unit rem|px] [--allow-dup-primitive]

Pipeline:
  STAGE 0  VALIDATE  — fail closed (exit 1) before any emit. Gates (a)-(h), plus the
                       profile-2 gates (i)-(m) when a profile-2 feature is declared.
  STAGE 1  RESOLVE   — deep-resolve every {alias} (incl. composite sub-values) to a
                       concrete value; overlay modes/<m>.json + themes/<t>.json.
  STAGE 2  EMIT       — the ONLY place units / CSS strings are realized.

The PATH->FLAT map (see PATH_FLAT_COLORS + the dynamic rules in build_frontmatter)
is the single contract that keeps DESIGN.md byte-stable across runs and check.sh
green. It lives here, cited from SKILL prose, never duplicated there.
"""
import argparse
import json
import os
import re
import sys

# --- profile constants -------------------------------------------------------

ALLOWED_TYPES = {
    "color", "dimension", "number", "fontWeight", "fontFamily",
    "duration", "cubicBezier", "shadow", "gradient", "typography",
}
# semantic role groups that MUST alias primitive (a scalar literal here is an ERR).
MEASURED_ROLES = {"color", "space", "radius", "typography", "typographyDisplay",
                  "elevation", "gradient"}
# platform-convention scaffold groups exempt from the must-alias rule.
SCAFFOLD_GROUPS = {"state", "motion", "opacity", "layout", "density", "material"}

TIERS = ("primitive", "semantic", "component")

# Unit-suffixed-number guard. A leaf value carrying these is an ERR — units are an
# export-time decision (meta.units), never a property of the source.
UNIT_RE = re.compile(r"\d\s*(?:px|pt|dp|rem|sp|ms)\b")
# A whole-string DTCG alias reference: "{dotted.path}".
ALIAS_RE = re.compile(r"^\{([^{}]+)\}$")
# A "{param:<name>}" marker — a CALL-SITE binding placeholder for a data/metric
# color (progress-ring fill, line-chart series, …), NOT a token alias. A recipe
# writes it so it never hard-codes one data instance; the concrete metric is bound
# where the recipe is used. Every projection passes it through VERBATIM and the
# alias-integrity gate SKIPS it (it is not a dangling alias, it has no target leaf).
PARAM_RE = re.compile(r"^\{param:[^{}]+\}$")

# --- profile-2 vocabulary (tokens-schema.md §10) -------------------------------
# Every profile-2 feature is optional; a set that declares none of them builds
# exactly as profile-1. Declaring any of them requires meta.spec to name profile-2.
PROFILE2_TAG = "design-extract/profile-2"
PROFILE2_META_KEYS = ("roles", "categories", "notUsed", "languages")
# meta.roles: fixed role -> allowed $type of the leaf it maps to.
ROLE_TYPES = {
    "text.primary": "color", "text.secondary": "color", "text.tertiary": "color",
    "surface.sunken": "color", "surface.default": "color",
    "surface.raised": "color", "surface.overlay": "color",
    "accent": "color", "onAccent": "color", "selection": "color", "divider": "color",
    "feedback.success": "color", "feedback.warning": "color", "feedback.error": "color",
    "elevation.sunken": "shadow", "elevation.default": "shadow",
    "elevation.raised": "shadow", "elevation.overlay": "shadow",
    "state.hover": "number", "state.focus": "number", "state.pressed": "number",
    "state.dragged": "number", "state.disabled": "number",
    "focusRing.width": "dimension", "focusRing.offset": "dimension",
    "focusRing.color": "color",
    "space.withinGroup": "dimension", "space.betweenGroups": "dimension",
    "space.section": "dimension",
    "radius.pill": "dimension", "radius.innerMin": "dimension",
    "hairline": "dimension",
}
ROLE_STATUSES = ("missing", "notApplicable")
# meta.categories: category -> (optional?, roles it requires declared, scale groups
# (path prefix, $type or None) that must hold >=1 leaf when the category is present).
CATEGORY_RULES = {
    "typography": (False, [], [("semantic.typography.", "typography")]),
    "fontWeight": (False, [], [("primitive.fontWeight.", "fontWeight")]),
    "color": (False, [r for r, t in ROLE_TYPES.items()
                      if t == "color" and not r.startswith("focusRing.")], []),
    "space": (False, ["space.withinGroup", "space.betweenGroups", "space.section"],
              [("primitive.dimension.space.", "dimension")]),
    "radius": (False, ["radius.pill", "radius.innerMin"],
               [("semantic.radius.", "dimension")]),
    "elevation": (False, ["elevation.sunken", "elevation.default",
                          "elevation.raised", "elevation.overlay"], []),
    "state": (False, ["state.hover", "state.focus", "state.pressed", "state.dragged",
                      "state.disabled", "focusRing.width", "focusRing.offset",
                      "focusRing.color"], []),
    "motion": (False, [], [("semantic.motion.duration.", "duration"),
                           ("semantic.motion.easing.", "cubicBezier")]),
    "hairline": (False, ["hairline"], []),
    "typographyDisplay": (True, [], [("semantic.typographyDisplay.", "typography")]),
    "breakpoint": (True, [], [("semantic.layout.breakpoint.", "dimension")]),
    "zIndex": (True, [], [("semantic.layout.zIndex.", "number")]),
    "material": (True, [], [("semantic.material.", None)]),
    "dataViz": (True, [], [("semantic.color.dataViz.", None)]),
}
CATEGORY_STATUSES = ("present", "notApplicable", "missing")
TYPOGRAPHY_FIELDS = ("fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing")
LANG_OVERRIDE_FIELDS = ("fontFamily", "lineHeight", "letterSpacing")
NOT_USED_ID_RE = re.compile(r"^[a-z][a-z0-9-]*$")
CSS_PROPERTY_RE = re.compile(r"^-?[a-z][a-z-]*$")


class BuildError(Exception):
    """Raised for a structural/alias failure during resolution."""


# --- small helpers -----------------------------------------------------------

def deep_copy(obj):
    """Stdlib-only deep copy (avoids importing copy); inputs are JSON-clean."""
    return json.loads(json.dumps(obj))


def is_param(value):
    return isinstance(value, str) and PARAM_RE.match(value.strip()) is not None


def param_name(value):
    """'{param:metric-gradient}' -> 'metric-gradient' (None if not a param)."""
    if not is_param(value):
        return None
    return value.strip()[len("{param:"):-1]


def is_alias(value):
    return (isinstance(value, str)
            and ALIAS_RE.match(value.strip()) is not None
            and not is_param(value))


def alias_target(value):
    if is_param(value):
        return None  # a call-site param marker, not an alias path
    m = ALIAS_RE.match(value.strip())
    return m.group(1) if m else None


def fmt_num(n):
    """Compact, deterministic number rendering: int-valued floats lose the .0."""
    if isinstance(n, bool):
        return "1" if n else "0"
    if isinstance(n, float):
        if n.is_integer():
            return str(int(n))
        return ("%f" % n).rstrip("0").rstrip(".")
    return str(n)


def kebab_seg(seg):
    """camelCase -> kebab for a single path segment; digits/lowercase pass through."""
    return re.sub(r"(?<=[a-z0-9])(?=[A-Z])", "-", str(seg)).lower()


def kebab_path(path):
    return "-".join(kebab_seg(s) for s in path.split("."))


# --- tree walk: leaves + inherited $type and $extensions facets --------------

def collect_leaves(tree, meta_defaults, ext_ns):
    """Walk the three tiers; return {path: {type, facets, value}} for every leaf.

    A node is a LEAF iff it carries `$value` — the walker stops there and never
    recurses into `$value`/`$type`/`$extensions`/`$description`. `$type` and the
    `$extensions[ext_ns]` facet block cascade from the nearest ancestor that
    declares them, with `meta.defaults` as the global facet backstop.
    """
    leaves = {}

    def walk(node, path, type_inherited, facets_inherited):
        if not isinstance(node, dict):
            return
        own_type = node.get("$type", type_inherited)
        facets = dict(facets_inherited)
        ext = node.get("$extensions", {})
        if isinstance(ext, dict) and isinstance(ext.get(ext_ns), dict):
            facets.update(ext[ext_ns])
        if "$value" in node:
            leaves[path] = {"type": own_type, "facets": facets, "value": node["$value"]}
            return
        for key, child in node.items():
            if key.startswith("$"):
                continue
            child_path = (path + "." + key) if path else key
            walk(child, child_path, own_type, facets)

    for tier in TIERS:
        if tier in tree:
            walk(tree[tier], tier, None, dict(meta_defaults))
    return leaves


# --- alias resolution --------------------------------------------------------

def resolve_value(value, leaves, chain):
    """Deep-resolve a leaf value: substitute every {alias} (incl. composite
    sub-values) transitively to concrete values. Dangling / cyclic = BuildError."""
    if isinstance(value, str):
        target = alias_target(value)
        if target is None:
            return value  # literal hex / font name / etc.
        if target in chain:
            raise BuildError("cyclic alias: " + " -> ".join(chain + [target]))
        leaf = leaves.get(target)
        if leaf is None:
            raise BuildError("dangling alias '%s' (path '%s' is not a leaf)"
                             % (value, target))
        return resolve_value(leaf["value"], leaves, chain + [target])
    if isinstance(value, dict):
        return {k: resolve_value(v, leaves, chain) for k, v in value.items()}
    if isinstance(value, list):
        return [resolve_value(v, leaves, chain) for v in value]
    return value


def resolve_all(leaves):
    return {p: resolve_value(info["value"], leaves, []) for p, info in leaves.items()}


# --- STAGE 0: validate -------------------------------------------------------

def find_unit_suffix(value):
    """Return the first non-alias string carrying a unit suffix, else None."""
    if isinstance(value, str):
        if ALIAS_RE.match(value.strip()):
            return None  # alias path, not a measured value
        return value if UNIT_RE.search(value) else None
    if isinstance(value, dict):
        for v in value.values():
            hit = find_unit_suffix(v)
            if hit:
                return hit
    if isinstance(value, list):
        for v in value:
            hit = find_unit_suffix(v)
            if hit:
                return hit
    return None


def validate(tree, leaves, allow_dup_primitive, overrides):
    """Run gates (a)-(g) over the base graph + parity for overrides. Return errors."""
    errors = []

    # (b) DTCG validity: every leaf resolves an allowed $type and has a $value.
    for path, info in leaves.items():
        t = info["type"]
        if t is None:
            errors.append("[dtcg] leaf '%s' resolves no $type (own or ancestor)" % path)
        elif t not in ALLOWED_TYPES:
            errors.append("[dtcg] leaf '%s' has disallowed $type '%s'" % (path, t))

    # (c) UNITLESS guard: no dimension/duration value carries a unit suffix.
    for path, info in leaves.items():
        hit = find_unit_suffix(info["value"])
        if hit is not None:
            errors.append("[unitless] unit-suffixed value '%s' at '%s' "
                          "(units are an export-time decision, keep the source bare)"
                          % (hit, path))

    # (d) TIER purity: a semantic measured-role SCALAR leaf must be an {alias}.
    for path, info in leaves.items():
        parts = path.split(".")
        if parts[0] != "semantic" or len(parts) < 2:
            continue
        role = parts[1]
        if role not in MEASURED_ROLES:
            continue  # scaffold groups may hold literals
        val = info["value"]
        if isinstance(val, (dict, list)):
            continue  # composite (typography/shadow/gradient): mixed alias+geometry OK
        if not is_alias(val):
            errors.append("[tier] semantic measured-role leaf '%s' is a literal "
                          "'%s' — it MUST alias primitive" % (path, val))

    # (e) PRIMITIVE dedup: two primitive.color.* leaves with an identical hex.
    by_hex = {}
    for path, info in leaves.items():
        if path.startswith("primitive.color.") and isinstance(info["value"], str) \
                and info["value"].startswith("#"):
            by_hex.setdefault(info["value"].upper(), []).append(path)
    for hexv, paths in by_hex.items():
        if len(paths) > 1 and not allow_dup_primitive:
            errors.append("[primitive-dedup] duplicate primitive hex %s at %s "
                          "(alias one to the other, or pass --allow-dup-primitive)"
                          % (hexv, ", ".join(sorted(paths))))

    # (f) ALIAS integrity: every {dotted.path} resolves to a leaf; cycle-detect.
    for path, info in leaves.items():
        try:
            resolve_value(info["value"], leaves, [])
        except BuildError as exc:
            errors.append("[alias] %s at '%s'" % (exc, path))

    # (g) confidence facet resolves for every leaf (own/group/meta.defaults).
    for path, info in leaves.items():
        if "confidence" not in info["facets"]:
            errors.append("[facet] leaf '%s' resolves no confidence facet "
                          "(set it on the leaf, an ancestor, or meta.defaults)" % path)

    # parity: each override's leaf-path set is a subset of base semantic leaf-paths.
    base_semantic = {p for p in leaves if p.startswith("semantic.")}
    for label, otree in overrides:
        for opath in collect_override_leaf_paths(otree):
            if opath not in base_semantic:
                errors.append("[parity] override %s re-points '%s', which is not a "
                              "base semantic leaf" % (label, opath))

    # (h) $coverage: a MODE override may declare, for base semantic leaves it does
    # NOT re-point, whether they were confirmed-same or simply not captured. Keys
    # are exactly notCaptured/confirmedSame; every path must be a base semantic
    # leaf, must not also be overridden in the same file, and may appear once.
    for label, otree in overrides:
        cov = otree.get("$coverage")
        if cov is None:
            continue
        if not label.startswith("modes/"):
            errors.append("[coverage] %s: $coverage is only allowed in mode "
                          "overrides" % label)
            continue
        if not isinstance(cov, dict):
            errors.append("[coverage] %s: $coverage must be an object" % label)
            continue
        for key in cov:
            if key not in ("notCaptured", "confirmedSame"):
                errors.append("[coverage] %s: unknown $coverage key '%s'"
                              % (label, key))
        opaths = set(collect_override_leaf_paths(otree))
        seen = set()
        for key in ("notCaptured", "confirmedSame"):
            for p in (cov.get(key) or []):
                if p in seen:
                    errors.append("[coverage] %s: '%s' listed twice in $coverage"
                                  % (label, p))
                seen.add(p)
                if p not in base_semantic:
                    errors.append("[coverage] %s: $coverage.%s '%s' is not a base "
                                  "semantic leaf" % (label, key, p))
                if p in opaths:
                    errors.append("[coverage] %s: '%s' is both overridden and "
                                  "declared in $coverage.%s" % (label, p, key))

    return errors


def coverage_warnings(base_leaves, overrides):
    """Advisory (never fatal): semantic.color leaves a mode override neither
    re-points nor declares in $coverage — the application side cannot tell
    'inherits base on purpose' from 'extraction missed it'."""
    warns = []
    base_color = [p for p, i in base_leaves.items()
                  if p.startswith("semantic.color.") and i["type"] == "color"]
    for label, otree in overrides:
        if not label.startswith("modes/"):
            continue
        opaths = set(collect_override_leaf_paths(otree))
        cov = otree.get("$coverage") or {}
        declared = set(cov.get("notCaptured") or []) | set(cov.get("confirmedSame") or [])
        und = [p for p in base_color if p not in opaths and p not in declared]
        if und:
            warns.append('WARN [coverage] %s: %d semantic.color leaves neither '
                         'overridden nor declared in $coverage (e.g. %s)'
                         % (label, len(und), ", ".join(und[:3])))
    return warns


def collect_override_leaf_paths(otree):
    """Leaf paths declared in an override file (nodes carrying $value)."""
    out = []

    def walk(node, path):
        if not isinstance(node, dict):
            return
        if "$value" in node:
            out.append(path)
            return
        for k, v in node.items():
            if k.startswith("$"):
                continue
            walk(v, (path + "." + k) if path else k)

    for tier in TIERS:
        if tier in otree:
            walk(otree[tier], tier)
    return out


# --- STAGE 0 (profile-2): roles / categories / notUsed / languages / langOverrides

def is_profile2(meta):
    return PROFILE2_TAG in str(meta.get("spec", ""))


def lang_override_leaves(leaves):
    """Typography leaves carrying a langOverrides facet -> {path: {lang: fields}}."""
    out = {}
    for path, info in leaves.items():
        lo = info["facets"].get("langOverrides")
        if lo is not None and info["type"] == "typography":
            out[path] = lo
    return out


def validate_profile2(tree, leaves):
    """Gates (i)-(m). Silent for a set that declares no profile-2 feature."""
    errors = []
    meta = tree.get("meta", {})
    used = [k for k in PROFILE2_META_KEYS if k in meta]
    lang_leaves = lang_override_leaves(leaves)
    if lang_leaves:
        used.append("langOverrides")
    if not used:
        return errors
    if not is_profile2(meta):
        errors.append("[profile] %s requires meta.spec to name '%s'"
                      % (", ".join(used), PROFILE2_TAG))

    # (i) roles: known keys; each maps to a typed leaf or an explicit status.
    roles = meta.get("roles")
    if roles is not None and not isinstance(roles, dict):
        errors.append("[roles] meta.roles must be an object")
        roles = None
    for role, target in (roles or {}).items():
        want = ROLE_TYPES.get(role)
        if want is None:
            errors.append("[roles] unknown role '%s'" % role)
            continue
        if isinstance(target, dict):
            if target.get("status") not in ROLE_STATUSES:
                errors.append("[roles] '%s' status must be one of %s"
                              % (role, "/".join(ROLE_STATUSES)))
            if not str(target.get("reason", "")).strip():
                errors.append("[roles] '%s' is %s without a reason"
                              % (role, target.get("status")))
            continue
        leaf = leaves.get(target) if isinstance(target, str) else None
        if leaf is None:
            errors.append("[roles] '%s' -> '%s' is not a leaf" % (role, target))
            continue
        if leaf["type"] != want:
            errors.append("[roles] '%s' -> '%s' is $type %s, expected %s"
                          % (role, target, leaf["type"], want))
            continue
        if role.startswith("state."):
            try:
                v = resolve_value(leaf["value"], leaves, [])
            except BuildError:
                continue  # reported by gate (f)
            if not isinstance(v, (int, float)) or isinstance(v, bool) or not 0 <= v <= 1:
                errors.append("[roles] '%s' -> '%s' must resolve to an opacity 0..1"
                              % (role, target))

    # (j) categories: all declared, valid status, reasons, required roles/scales.
    cats = meta.get("categories")
    if cats is not None:
        if not isinstance(cats, dict):
            errors.append("[categories] meta.categories must be an object")
            cats = {}
        for name in cats:
            if name not in CATEGORY_RULES:
                errors.append("[categories] unknown category '%s'" % name)
        for name, (optional, need_roles, scales) in CATEGORY_RULES.items():
            entry = cats.get(name)
            if entry is None:
                errors.append("[categories] '%s' not declared (every category must be "
                              "present, notApplicable or missing)" % name)
                continue
            status = entry.get("status") if isinstance(entry, dict) else None
            if status not in CATEGORY_STATUSES:
                errors.append("[categories] '%s' status must be one of %s"
                              % (name, "/".join(CATEGORY_STATUSES)))
                continue
            if status != "present":
                if not str(entry.get("reason", "")).strip():
                    errors.append("[categories] '%s' is %s without a reason" % (name, status))
                if status == "notApplicable" and not optional:
                    errors.append("[categories] '%s' is required; use missing, not "
                                  "notApplicable" % name)
                for r in need_roles:
                    if isinstance((roles or {}).get(r), str):
                        errors.append("[categories] '%s' is %s but role '%s' maps to a "
                                      "leaf" % (name, status, r))
                continue
            for r in need_roles:
                if r not in (roles or {}):
                    errors.append("[categories] '%s' is present but role '%s' is not "
                                  "declared in meta.roles" % (name, r))
            for prefix, want in scales:
                hits = [p for p, i in leaves.items()
                        if p.startswith(prefix) and (want is None or i["type"] == want)]
                if not hits:
                    errors.append("[categories] '%s' is present but has no %s leaf under "
                                  "'%s*'" % (name, want or "", prefix))
        def status_of(name):
            entry = cats.get(name)
            return entry.get("status") if isinstance(entry, dict) else None

        for name in ("typography", "typographyDisplay"):
            if status_of(name) != "present":
                continue
            for path, info in leaves.items():
                if not path.startswith("semantic.%s." % name) or info["type"] != "typography":
                    continue
                try:
                    v = resolve_value(info["value"], leaves, [])
                except BuildError:
                    continue
                if not isinstance(v, dict):
                    errors.append("[categories] typography step '%s' is not a typography "
                                  "composite" % path)
                    continue
                miss = [f for f in TYPOGRAPHY_FIELDS if f not in v]
                if miss:
                    errors.append("[categories] typography step '%s' lacks %s"
                                  % (path, ", ".join(miss)))
        if status_of("fontWeight") == "present":
            allowed = set()
            for p, i in leaves.items():
                if p.startswith("primitive.fontWeight.") and i["type"] == "fontWeight":
                    try:
                        allowed.add(resolve_value(i["value"], leaves, []))
                    except BuildError:
                        continue
            for path, info in leaves.items():
                if info["type"] != "typography":
                    continue
                try:
                    w = resolve_value(info["value"], leaves, []).get("fontWeight")
                except (BuildError, AttributeError):
                    continue
                if w is not None and w not in allowed:
                    errors.append("[categories] '%s' uses fontWeight %s outside the "
                                  "primitive.fontWeight set" % (path, fmt_num(w)))

    # (k) notUsed: machine-readable "this system does not use" register.
    nu = meta.get("notUsed")
    if nu is not None:
        if not isinstance(nu, list):
            errors.append("[notUsed] meta.notUsed must be a list")
            nu = []
        seen = set()
        for i, item in enumerate(nu):
            if not isinstance(item, dict):
                errors.append("[notUsed] entry %d must be an object" % i)
                continue
            iid = item.get("id")
            if not isinstance(iid, str) or not NOT_USED_ID_RE.match(iid):
                errors.append("[notUsed] entry %d id must be kebab-case" % i)
            elif iid in seen:
                errors.append("[notUsed] duplicate id '%s'" % iid)
            else:
                seen.add(iid)
            if not str(item.get("note", "")).strip():
                errors.append("[notUsed] '%s' has no note" % iid)
            css = item.get("css")
            if css is None:
                continue
            if not isinstance(css, dict) or not (css.get("property") or css.get("valuePattern")):
                errors.append("[notUsed] '%s' css needs property and/or valuePattern" % iid)
                continue
            for k in css:
                if k not in ("property", "valuePattern"):
                    errors.append("[notUsed] '%s' css has unknown key '%s'" % (iid, k))
            prop = css.get("property")
            if prop is not None and not (isinstance(prop, str) and CSS_PROPERTY_RE.match(prop)):
                errors.append("[notUsed] '%s' css.property '%s' is not a CSS property name"
                              % (iid, prop))
            pat = css.get("valuePattern")
            if pat is not None:
                try:
                    re.compile(pat)
                except (re.error, TypeError):
                    errors.append("[notUsed] '%s' css.valuePattern does not compile" % iid)
                    continue
                if re.search(r"\(\?(?![:=!])", pat):
                    errors.append("[notUsed] '%s' css.valuePattern uses a (? construct outside "
                                  "(?: (?= (?! — Python and JS dialects differ" % iid)

    # (l) languages: BCP 47 tags the project writes in.
    langs = meta.get("languages")
    if langs is not None and not (isinstance(langs, list) and langs and all(
            isinstance(x, str) and re.match(r"^[a-z]{2,3}(-[A-Za-z0-9]+)*$", x)
            for x in langs)):
        errors.append("[languages] meta.languages must be a non-empty list of BCP 47 tags")

    # (m) langOverrides on typography: per-language fontFamily/lineHeight/letterSpacing.
    for path, lo in lang_leaves.items():
        if not isinstance(lo, dict):
            errors.append("[langOverrides] '%s' must map language -> fields "
                          "({} opts a leaf out of an inherited override)" % path)
            continue
        for lang, fields in lo.items():
            if not re.match(r"^[a-z]{2,3}(-[A-Za-z0-9]+)*$", str(lang)):
                errors.append("[langOverrides] '%s' key '%s' is not a BCP 47 tag"
                              % (path, lang))
            if not isinstance(fields, dict) or not fields:
                errors.append("[langOverrides] '%s'.%s must be a non-empty object"
                              % (path, lang))
                continue
            for f, v in fields.items():
                if f not in LANG_OVERRIDE_FIELDS:
                    errors.append("[langOverrides] '%s'.%s has unsupported field '%s'"
                                  % (path, lang, f))
                    continue
                hit = find_unit_suffix(v)
                if hit is not None:
                    errors.append("[unitless] unit-suffixed value '%s' at '%s' langOverrides"
                                  % (hit, path))
                try:
                    resolve_value(v, leaves, [])
                except BuildError as exc:
                    errors.append("[alias] %s at '%s' langOverrides.%s.%s"
                                  % (exc, path, lang, f))
    return errors


# --- override overlay (modes / themes) ---------------------------------------

def deep_merge(base, override):
    """Recursive overlay: override dicts merge into base, scalars/lists replace."""
    result = deep_copy(base)
    for k, v in override.items():
        if k in result and isinstance(result[k], dict) and isinstance(v, dict):
            result[k] = deep_merge(result[k], v)
        else:
            result[k] = v
    return result


# --- STAGE 2: unit + CSS-string realization (the ONLY place units appear) -----

def css_dim(value, scaling, css_unit, units):
    if scaling == "ratio":
        return fmt_num(value)
    if scaling == "scalable":
        if css_unit == "px":
            return fmt_num(value) + "px"
        rem_base = units.get("remBase", 16)
        return fmt_num(value / rem_base) + "rem"
    return fmt_num(value) + "px"  # absolute (default)


def css_len(n):
    """Box-shadow length: bare 0, else Npx (shadows are absolute)."""
    return "0" if n == 0 else fmt_num(n) + "px"


def css_shadow(value):
    parts = [css_len(value.get("offsetX", 0)),
             css_len(value.get("offsetY", 0)),
             css_len(value.get("blur", 0))]
    spread = value.get("spread", 0)
    if spread:
        parts.append(css_len(spread))
    parts.append(value.get("color", "#000000"))
    return " ".join(parts)


def css_gradient(value, facets):
    geom = facets.get("geometry", "linear")
    angle = facets.get("angle", 0)
    stops = ", ".join("%s %s%%" % (s.get("color", "#000000"),
                                   fmt_num(s.get("position", 0) * 100))
                      for s in value)
    if geom == "conic":
        return "conic-gradient(from %sdeg, %s)" % (fmt_num(angle), stops)
    if geom == "radial":
        return "radial-gradient(%s)" % stops
    return "linear-gradient(%sdeg, %s)" % (fmt_num(angle), stops)


# Structural keywords stripped when flattening a nested component recipe to a CSS
# var: component.gauge.variants.large.track -> --component-gauge-large-track (the
# variant/state NAME is kept, only the base/variants/sizes/states keyword drops).
COMPONENT_STRUCT_SEGS = {"base", "variants", "sizes", "states"}


def css_var_name(path):
    parts = path.split(".")
    if parts and parts[0] == "component":
        parts = [p for p in parts if p not in COMPONENT_STRUCT_SEGS]
    return "--" + kebab_path(".".join(parts))


def css_vars_for_leaf(path, leaf_type, value, facets, css_unit, units):
    """Realize one resolved leaf to one-or-more (--var, css-value) pairs."""
    name = css_var_name(path)
    if is_param(value):
        # call-site binding: expose as a CSS var the caller defines per metric,
        # e.g. {param:metric-gradient} -> var(--metric-gradient). Short-circuits
        # before any type-specific realization so a param never gets unitized.
        return [(name, "var(--%s)" % param_name(value))]
    if leaf_type == "color":
        return [(name, value)]
    if leaf_type == "dimension":
        return [(name, css_dim(value, facets.get("scaling"), css_unit, units))]
    if leaf_type in ("number", "fontWeight"):
        return [(name, fmt_num(value))]
    if leaf_type == "fontFamily":
        ff = ", ".join(value) if isinstance(value, list) else str(value)
        return [(name, ff)]
    if leaf_type == "duration":
        return [(name, fmt_num(value) + units.get("timeUnit", "ms"))]
    if leaf_type == "cubicBezier":
        return [(name, "cubic-bezier(" + ", ".join(fmt_num(x) for x in value) + ")")]
    if leaf_type == "shadow":
        return [(name, css_shadow(value))]
    if leaf_type == "gradient":
        return [(name, css_gradient(value, facets))]
    if leaf_type == "typography":
        scaling = facets.get("scaling", "scalable")
        out = []
        if "fontFamily" in value:
            ff = value["fontFamily"]
            out.append((name + "-font-family",
                        ", ".join(ff) if isinstance(ff, list) else str(ff)))
        if "fontSize" in value:
            out.append((name + "-font-size",
                        css_dim(value["fontSize"], scaling, css_unit, units)))
        if "fontWeight" in value:
            out.append((name + "-font-weight", fmt_num(value["fontWeight"])))
        if "lineHeight" in value:
            out.append((name + "-line-height", fmt_num(value["lineHeight"])))
        if "letterSpacing" in value:
            out.append((name + "-letter-spacing",
                        css_dim(value["letterSpacing"], "absolute", css_unit, units)))
        return out
    return [(name, fmt_num(value) if isinstance(value, (int, float)) else str(value))]


def variant_css_map(leaves, resolved, css_unit, units):
    """Ordered {var: value} for one resolved variant (walk order = deterministic)."""
    out = []
    for path, info in leaves.items():
        for var, val in css_vars_for_leaf(path, info["type"], resolved[path],
                                           info["facets"], css_unit, units):
            out.append((var, val))
    return out


# --- EMIT: resolved ----------------------------------------------------------

def build_resolved_tree(base_tree, leaves, resolved, ext_ns="com.design-extract"):
    """Full-doc copy with every leaf $value de-aliased; $type/$extensions kept.
    A typography leaf's effective langOverrides (own or inherited) is written onto
    the leaf de-aliased, so consumers never walk groups to find it."""
    tree = deep_copy(base_tree)

    def walk(node, path):
        if not isinstance(node, dict):
            return
        if "$value" in node:
            node["$value"] = resolved[path]
            lo = leaves[path]["facets"].get("langOverrides")
            if lo is not None and leaves[path]["type"] == "typography":
                ext = node.setdefault("$extensions", {}).setdefault(ext_ns, {})
                ext["langOverrides"] = resolve_value(lo, leaves, [])
            return
        for k, v in node.items():
            if k.startswith("$"):
                continue
            walk(v, (path + "." + k) if path else k)

    for tier in TIERS:
        if tier in tree:
            walk(tree[tier], tier)
    return tree


# --- EMIT: css ---------------------------------------------------------------

def lang_css_blocks(leaves, css_unit, units):
    """profile-2 `[lang]:lang(<tag>)` blocks re-pointing the typography per-axis vars
    of every leaf with langOverrides, plus `[lang]:not(:lang(<tag>))` resets. Emitted
    after the base :root so html or any sample carrying lang= takes the override
    and an embedded sample in another language gets base values back. Empty -> []."""
    by_lang, order = {}, []
    for path, lo in lang_override_leaves(leaves).items():
        name = css_var_name(path)
        for lang, fields in lo.items():
            if lang not in by_lang:
                by_lang[lang] = []
                order.append(lang)
            for f in LANG_OVERRIDE_FIELDS:
                if f not in fields:
                    continue
                v = resolve_value(fields[f], leaves, [])
                if f == "fontFamily":
                    by_lang[lang].append((name + "-font-family",
                                          ", ".join(v) if isinstance(v, list) else str(v)))
                elif f == "lineHeight":
                    by_lang[lang].append((name + "-line-height", fmt_num(v)))
                else:
                    by_lang[lang].append((name + "-letter-spacing",
                                          css_dim(v, "absolute", css_unit, units)))
    # Only elements that CARRY a lang attribute re-declare vars; descendants inherit,
    # so container-level overrides keep working. An element switching to another
    # language re-asserts the base values first; every reset precedes every
    # language block so a matching language always wins (same specificity).
    base = dict(variant_css_map(leaves, resolve_all(leaves), css_unit, units))
    lines = []
    for lang in order:
        names = []
        for var, _val in by_lang[lang]:
            if var in base and var not in names:
                names.append(var)
        if not names:
            continue
        lines += ["", '/* lang "%s" — other languages re-assert base typography */' % lang,
                  "[lang]:not(:lang(%s)) {" % lang]
        for var in names:
            lines.append("  %s: %s;" % (var, base[var]))
        lines.append("}")
    for lang in order:
        if not by_lang[lang]:
            continue
        lines += ["", '/* lang "%s" — typography overrides (langOverrides) */' % lang,
                  "[lang]:lang(%s) {" % lang]
        for var, val in by_lang[lang]:
            lines.append("  %s: %s;" % (var, val))
        lines.append("}")
    return lines


def emit_css(base_tree, base_leaves, meta_defaults, ext_ns, css_unit, units,
             default_mode, modes, themes, design_dir):
    base_resolved = resolve_all(base_leaves)
    base_pairs = variant_css_map(base_leaves, base_resolved, css_unit, units)
    base_lookup = dict(base_pairs)

    lines = ["/* tokens.css — generated by build_tokens.py; do not hand-edit. */",
             "/* base = %s (default mode); deltas layered below. */" % default_mode,
             ":root {"]
    for var, val in base_pairs:
        lines.append("  %s: %s;" % (var, val))
    lines.append("}")
    lines += lang_css_blocks(base_leaves, css_unit, units)

    def delta_block(label, override_tree, opener):
        composed = deep_merge(base_tree, override_tree)
        cl = collect_leaves(composed, meta_defaults, ext_ns)
        cres = resolve_all(cl)
        cpairs = variant_css_map(cl, cres, css_unit, units)
        deltas = [(v, val) for v, val in cpairs if base_lookup.get(v) != val]
        out = ["", "/* %s */" % label, opener]
        for v, val in deltas:
            out.append("  %s: %s;" % (v, val))
        out.append("}")
        out.append("}" if opener.startswith("@media") else None)
        return [x for x in out if x is not None], deltas

    # non-default modes -> BOTH @media (prefers-color-scheme: <mode>) (auto, OS
    # preference) AND [data-theme="<mode>"] (manual, explicit opt-in). Same deltas
    # in both so auto and manual dark resolve identically. Named THEMES below stay
    # [data-theme="<theme>"]-only.
    mode_delta_vars, _seen = [], set()
    for mode in modes:
        if mode == default_mode:
            continue
        otree = load_override(design_dir, "modes", mode)
        if otree is None:
            lines += ["", '/* mode "%s": no modes/%s.json override; no deltas */'
                      % (mode, mode)]
            continue
        block, deltas = delta_block('mode "%s" (auto / prefers-color-scheme)' % mode, otree,
                                    "@media (prefers-color-scheme: %s) {\n  :root {" % mode)
        lines += block
        block, _ = delta_block('mode "%s" (manual / data-theme)' % mode, otree,
                               '[data-theme="%s"] {' % mode)
        lines += block
        nc = (otree.get("$coverage") or {}).get("notCaptured") or []
        if nc:
            lines += ["", '/* mode "%s" — NOT captured (values inherit base, unverified): %s */'
                      % (mode, ", ".join(nc))]
        for v, _val in deltas:
            if v not in _seen and v in base_lookup:
                _seen.add(v)
                mode_delta_vars.append(v)

    # default mode -> [data-theme="<default>"] re-assert. Placed AFTER the
    # @media auto blocks so (same 0,1,0 specificity, later in cascade) a manual
    # default-mode opt-in wins over the OS preference in BOTH directions —
    # without it, data-theme="light" cannot beat @media dark. Re-asserts only
    # the vars some non-default mode changes; absent for single-mode sets.
    if mode_delta_vars:
        lines += ["", '/* mode "%s" (manual / data-theme) — re-asserts base values so the'
                      ' manual default-mode opt-in beats any @media auto block */' % default_mode,
                  '[data-theme="%s"] {' % default_mode]
        for v in mode_delta_vars:
            lines.append("  %s: %s;" % (v, base_lookup[v]))
        lines.append("}")

    # themes -> [data-theme="<theme>"]
    for theme in themes:
        otree = load_override(design_dir, "themes", theme)
        if otree is None:
            lines += ["", '/* theme "%s": no themes/%s.json override; no deltas */'
                      % (theme, theme)]
            continue
        block, _ = delta_block('theme "%s"' % theme, otree,
                               '[data-theme="%s"] {' % theme)
        lines += block

    return "\n".join(lines) + "\n"


# --- EMIT: tailwind / shadcn adapters -----------------------------------------
#
# Both adapters sit ON TOP of tokens.css: every value is a var() reference into
# the custom properties, so modes/themes cascade for free and the adapters stay
# byte-stable across mode edits. Each file @imports ./tokens.css — a project
# imports exactly ONE adapter (tailwind OR shadcn), never both.

def emit_tailwind(base_leaves, resolved):
    """Tailwind v4 `@theme inline` adapter. Maps only tokens with a stable flat
    home (colors via the PATH->FLAT contract, semantic radius, font families,
    semantic typography sizes); everything else (categorical, dataViz gradients,
    spacing) stays reachable through the raw tokens.css custom properties."""
    colors, radii, fonts, texts = [], [], [], []
    for path, info in base_leaves.items():
        t = info["type"]
        if t == "color":
            flat = color_flat_name(path)
            if flat:
                colors.append(("--color-%s" % flat, "var(%s)" % css_var_name(path)))
        elif t == "fontFamily":
            # a leaf literally named fontFamily (e.g. material.code.fontFamily)
            # takes its parent's name: --font-code, not --font-font-family.
            segs = path.split(".")
            seg = segs[-2] if kebab_seg(segs[-1]) == "font-family" and len(segs) > 1 else segs[-1]
            fonts.append(("--font-%s" % kebab_seg(seg),
                          "var(%s)" % css_var_name(path)))
        elif t == "typography" and re.match(r"semantic\.typography\.\w+$", path):
            name = kebab_seg(path.split(".")[-1])
            tv = resolved.get(path) or {}
            if "fontSize" in tv:
                texts.append(("--text-%s" % name, "var(%s-font-size)" % css_var_name(path)))
        elif t == "dimension" and re.match(r"semantic\.radius\.\w+$", path):
            radii.append(("--radius-%s" % kebab_seg(path.split(".")[-1]),
                          "var(%s)" % css_var_name(path)))
    lines = ["/* tokens.tailwind.css — generated by build_tokens.py; do not hand-edit. */",
             "/* Tailwind v4 adapter over tokens.css: import THIS file (it pulls tokens.css in),",
             "   not both adapters. Values are var() refs, so modes/themes cascade through the",
             "   underlying custom properties. Unmapped groups (categorical, dataViz, spacing)",
             "   stay on the raw tokens.css vars. */",
             '@import "./tokens.css";',
             "",
             "@theme inline {"]
    for group in (colors, radii, fonts, texts):
        for var, val in group:
            lines.append("  %s: %s;" % (var, val))
    lines.append("}")
    return "\n".join(lines) + "\n"


# shadcn/ui variable wiring: fixed candidate chains, first base leaf that exists
# (and type-matches) wins. This list is a byte-stability contract like
# PATH_FLAT_COLORS — extend, don't reorder.
SHADCN_MAP = [
    ("--background", "color", ["semantic.color.surface.background"]),
    ("--foreground", "color", ["semantic.color.text.primary"]),
    ("--card", "color", ["semantic.color.surface.raised",
                         "semantic.color.surface.background"]),
    ("--card-foreground", "color", ["semantic.color.text.primary"]),
    ("--popover", "color", ["semantic.color.surface.overlay",
                            "semantic.color.surface.raised"]),
    ("--popover-foreground", "color", ["semantic.color.text.primary"]),
    ("--primary", "color", ["semantic.color.action.primary"]),
    ("--primary-foreground", "color", ["semantic.color.text.onAction"]),
    ("--secondary", "color", ["semantic.color.action.secondary",
                              "semantic.color.surface.sunken",
                              "semantic.color.surface.subtle",
                              "semantic.color.surface.raised"]),
    ("--secondary-foreground", "color", ["semantic.color.text.primary"]),
    ("--muted", "color", ["semantic.color.surface.sunken",
                          "semantic.color.surface.muted",
                          "semantic.color.surface.subtle",
                          "semantic.color.surface.alt",
                          "semantic.color.surface.grouped",
                          "semantic.color.surface.raised"]),
    ("--muted-foreground", "color", ["semantic.color.text.secondary"]),
    ("--accent", "color", ["semantic.state.selected.fill",
                           "semantic.state.selected.bg",
                           "semantic.state.selected.tint",
                           "semantic.color.surface.selected",
                           "semantic.color.surface.sunken"]),
    ("--accent-foreground", "color", ["semantic.color.text.primary"]),
    ("--destructive", "color", ["semantic.color.action.destructive",
                                "semantic.color.feedback.error"]),
    ("--border", "color", ["semantic.color.border.subtle",
                           "semantic.color.border.default"]),
    ("--input", "color", ["semantic.color.border.strong",
                          "semantic.color.border.control",
                          "semantic.color.border.subtle"]),
    ("--ring", "color", ["semantic.state.focus.ring",
                         "semantic.color.action.primary"]),
    ("--radius", "dimension", ["semantic.radius.md",
                               "semantic.radius.control",
                               "semantic.radius.card",
                               "semantic.radius.lg",
                               "semantic.radius.sm"]),
] + [("--chart-%d" % n, "color", ["semantic.color.dataViz.series.%d" % n])
     for n in range(1, 6)]
# Variables that write NOTHING when unmapped — not even the "no mappable token"
# comment: dataViz is optional, and every committed tokens.shadcn.css of a set
# without series leaves is checked byte-for-byte against this generator.
SHADCN_OPTIONAL = {"--chart-%d" % n for n in range(1, 6)}


def emit_shadcn(base_leaves):
    """shadcn/ui adapter: conventional shadcn variables wired to the theme's
    semantic vars via fixed candidate chains, plus the standard Tailwind v4
    `@theme inline` bridge for the variables that were mappable."""
    mapped, missing = [], []
    for var, want_type, candidates in SHADCN_MAP:
        hit = next((p for p in candidates
                    if p in base_leaves and base_leaves[p]["type"] == want_type), None)
        if hit:
            mapped.append((var, "var(%s)" % css_var_name(hit)))
        elif var not in SHADCN_OPTIONAL:
            missing.append((var, candidates))
    lines = ["/* tokens.shadcn.css — generated by build_tokens.py; do not hand-edit. */",
             "/* shadcn/ui adapter over tokens.css: import THIS file (it pulls tokens.css in),",
             "   not both adapters. shadcn variables are var() refs into the theme's semantic",
             "   vars, so modes/themes cascade for free. */",
             '@import "./tokens.css";',
             "",
             ":root {"]
    for var, val in mapped:
        lines.append("  %s: %s;" % (var, val))
    for var, candidates in missing:
        lines.append("  /* %s: no mappable token (tried: %s) */"
                     % (var, ", ".join(candidates)))
    lines.append("}")
    lines += ["", "@theme inline {"]
    has_radius = False
    for var, _val in mapped:
        if var == "--radius":
            has_radius = True
            continue
        lines.append("  --color-%s: var(%s);" % (var.lstrip("-"), var))
    if has_radius:
        lines += ["  --radius-sm: calc(var(--radius) - 4px);",
                  "  --radius-md: calc(var(--radius) - 2px);",
                  "  --radius-lg: var(--radius);",
                  "  --radius-xl: calc(var(--radius) + 4px);"]
    lines.append("}")
    return "\n".join(lines) + "\n"


# --- EMIT: design-frontmatter (the PATH->FLAT contract) ----------------------

# Fixed semantic color path -> flat name. Extend here (and in the dynamic rules
# below) when the source grows roles; this dict is the byte-stability contract.
PATH_FLAT_COLORS = {
    "semantic.color.action.primary": "primary",
    "semantic.color.action.secondary": "secondary",
    "semantic.color.text.primary": "text-primary",
    "semantic.color.text.secondary": "text-secondary",
    "semantic.color.text.onAction": "on-primary",
    "semantic.color.surface.background": "surface-bg",
    "semantic.color.surface.raised": "surface-raised",
    "semantic.color.surface.overlay": "surface-overlay",
    "semantic.color.border.subtle": "border-subtle",
    "semantic.color.border.strong": "border-strong",
}
# component.button.primary.<field> -> self-referential frontmatter dialect.
BUTTON_FIELD_REFS = {
    "background": "{colors.primary}",
    "text": "{colors.on-primary}",
    "height": "{size.button-height}",
    "radius": "{rounded.full}",
    "font": "{type.body}",
}
# A categorical entry's per-field SOURCE key -> normalized frontmatter key. The
# tuple is stored as a bg+text pair (often a tinted pill + saturated text) with an
# optional dot; the source may name the fill `bg` or `tint` and the ink `text` or
# `ink`. Unknown field keys fall through kebab-cased (never dropped).
CATEGORICAL_FIELD_NORM = {
    "bg": "bg", "tint": "bg",
    "text": "text", "ink": "text",
    "dot": "dot",
}


def color_flat_name(path):
    if path in PATH_FLAT_COLORS:
        return PATH_FLAT_COLORS[path]
    m = re.match(r"primitive\.color\.neutral\.(\w+)$", path)
    if m:
        return "neutral-" + m.group(1)
    m = re.match(r"semantic\.color\.feedback\.(\w+)$", path)
    if m:
        return kebab_seg(m.group(1))
    m = re.match(r"semantic\.color\.dataViz\.(\w+)$", path)
    if m:
        return "chart-" + kebab_seg(m.group(1))
    return None


def gradient_metric(path):
    name = path.split(".")[-1]
    for suf in ("Ring", "Gradient", "Grad"):
        if name.endswith(suf) and len(name) > len(suf):
            name = name[:-len(suf)]
            break
    return kebab_seg(name)


# Structural keys that mark a `component.<name>` as a NESTED parametric recipe
# (vs the flat legacy `component.button.primary.<field>` shape).
COMPONENT_RECIPE_KEYS = {"base", "variants", "sizes", "states", "slots"}


def project_leaf_value(path, raw_value, ref_index, resolved):
    """Map one component sub-token leaf to its frontmatter representation.

    {param:*} -> passed through VERBATIM (a call-site binding, never resolved);
    {alias} with a flat frontmatter home -> the self-referential ref ({colors.x});
    any other alias / literal -> its resolved concrete value.
    """
    if is_param(raw_value):
        return raw_value
    if is_alias(raw_value):
        target = alias_target(raw_value)
        if target in ref_index:
            return ref_index[target]
    return resolved.get(path, raw_value)


def project_component_node(node, path, ref_index, resolved):
    """Walk a raw component subtree -> nested dict/list/scalar, preserving the
    base/variants/sizes/states nesting and the `slots` list of region names."""
    if isinstance(node, list):
        return list(node)  # slots: a flat list of named regions
    if isinstance(node, dict):
        if "$value" in node:
            return project_leaf_value(path, node["$value"], ref_index, resolved)
        out = {}
        for k, v in node.items():
            if k.startswith("$"):
                continue
            child = (path + "." + k) if path else k
            out[k] = project_component_node(v, child, ref_index, resolved)
        return out
    return node


def build_categorical(base_tree, ref_index, resolved):
    """Project `semantic.color.categorical.<name>` tuples to the flat dialect.

    A SIBLING of dataViz (NOT a child of it, NOT one of the 4 fixed semantic.*
    feedback slots): the N-ary, uncapped tag / label / status-enum / syntax-token
    palette. Each entry is a { bg|tint, text|ink, dot? } pair. ABSENT for an app
    with no such system -> [] (never forced). Field keys normalize to bg/text/dot;
    every value projects exactly like a component sub-token via project_leaf_value
    ({param:*} verbatim, an {alias} with a flat home -> its {colors.x} ref, any
    other alias / literal -> the resolved concrete value)."""
    out = []
    node = (((base_tree.get("semantic") or {}).get("color") or {}).get("categorical"))
    if not isinstance(node, dict):
        return out
    for entry_name, entry in node.items():
        if entry_name.startswith("$") or not isinstance(entry, dict):
            continue
        fields = {}
        for fkey, fnode in entry.items():
            if fkey.startswith("$") or not isinstance(fnode, dict) or "$value" not in fnode:
                continue
            out_key = CATEGORICAL_FIELD_NORM.get(fkey, kebab_seg(fkey))
            path = "semantic.color.categorical.%s.%s" % (entry_name, fkey)
            fields[out_key] = project_leaf_value(path, fnode["$value"], ref_index, resolved)
        if fields:
            out.append((entry_name, fields))
    return out


def build_frontmatter(base_leaves, base_tree):
    """LIGHT semantic+component layers renamed through the PATH->FLAT map.

    Frontmatter dimensions emit '<n>px'; lineHeight emits the unitless ratio;
    colors resolve to literal hex; components re-emit in the {colors.x} dialect.
    `ref_index` records, as each flat name is emitted, the token-path -> dialect
    ref ({colors.x}/{size.x}/...) so nested component recipes can alias by name.
    """
    resolved = resolve_all(base_leaves)
    colors, type_block, size_block, rounded_block = [], [], [], []
    components = []
    ref_index = {}

    for path, info in base_leaves.items():
        t = info["type"]
        rv = resolved[path]
        if t == "color":
            name = color_flat_name(path)
            if name:
                colors.append((name, rv))
                ref_index[path] = "{colors.%s}" % name
        elif t == "gradient" and path.startswith("semantic.gradient."):
            metric = gradient_metric(path)
            colors.append(("chart-%s-from" % metric, rv[0]["color"]))
            colors.append(("chart-%s-to" % metric, rv[-1]["color"]))

    # categorical tag/label/status palette (sibling of dataViz). Built after the
    # colors loop so its flat refs can resolve against the just-filled ref_index.
    categorical = build_categorical(base_tree, ref_index, resolved)

    if "component.button.primary.height" in base_leaves:
        size_block.append(("button-height",
                           fmt_num(resolved["component.button.primary.height"]) + "px"))
        ref_index["component.button.primary.height"] = "{size.button-height}"
    if "semantic.radius.pill" in base_leaves:
        rounded_block.append(("full",
                              fmt_num(resolved["semantic.radius.pill"]) + "px"))
        ref_index["semantic.radius.pill"] = "{rounded.full}"
    if "semantic.typography.body" in base_leaves:
        tb = resolved["semantic.typography.body"]
        if "fontSize" in tb:
            type_block.append(("body-size", fmt_num(tb["fontSize"]) + "px"))
        if "lineHeight" in tb:
            type_block.append(("body-line-height", fmt_num(tb["lineHeight"])))
        if "fontFamily" in tb:
            ff = tb["fontFamily"]
            type_block.append(("body-family",
                               ", ".join(ff) if isinstance(ff, list) else str(ff)))
        ref_index["semantic.typography.body"] = "{type.body}"

    # legacy flat component.button.primary -> self-referential dialect (fixed map).
    btn_fields = []
    for field in ("background", "text", "height", "radius", "font"):
        p = "component.button.primary." + field
        if p in base_leaves and field in BUTTON_FIELD_REFS:
            btn_fields.append((field, BUTTON_FIELD_REFS[field]))
    # any extra button leaf with no flat home -> emit its resolved literal.
    for path, info in base_leaves.items():
        if path.startswith("component.button.primary."):
            field = path.split(".")[-1]
            if field not in BUTTON_FIELD_REFS:
                rv = resolved[path]
                if isinstance(rv, str):
                    btn_fields.append((field, rv))
                elif isinstance(rv, (int, float)) and not isinstance(rv, bool):
                    btn_fields.append((field, fmt_num(rv)))
    if btn_fields:
        components.append(("button-primary", dict(btn_fields)))

    # nested PARAMETRIC recipes: component.<name> carrying base/variants/sizes/
    # states/slots -> structure-preserving projection (aliases resolved to flat
    # refs, {param:*} verbatim). Flat legacy shapes (button.primary) are skipped.
    for cname, cnode in (base_tree.get("component") or {}).items():
        if not isinstance(cnode, dict):
            continue
        if not (set(cnode.keys()) & COMPONENT_RECIPE_KEYS):
            continue
        components.append(
            (cname, project_component_node(cnode, "component." + cname,
                                           ref_index, resolved)))

    return render_frontmatter(colors, categorical, size_block, rounded_block,
                              type_block, components)


def _numeric(s):
    return bool(re.match(r"^-?\d+(\.\d+)?$", str(s)))


def _yaml_kv(key, value, indent):
    pad = " " * indent
    if _numeric(value):
        return '%s%s: %s' % (pad, key, value)
    return '%s%s: "%s"' % (pad, key, value)


def _yaml_scalar(value):
    """A bare YAML scalar: numbers unquoted, everything else double-quoted."""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return fmt_num(value)
    s = str(value)
    return s if _numeric(s) else '"%s"' % s


def _render_fm_node(key, value, indent, lines):
    """Emit one frontmatter node — dict -> nested block, list -> '- ' items,
    scalar -> 'key: value'. Drives the structure-preserving components block."""
    pad = " " * indent
    if isinstance(value, dict):
        lines.append("%s%s:" % (pad, key))
        for k, v in value.items():
            _render_fm_node(k, v, indent + 2, lines)
    elif isinstance(value, list):
        lines.append("%s%s:" % (pad, key))
        ipad = " " * (indent + 2)
        for item in value:
            lines.append("%s- %s" % (ipad, _yaml_scalar(item)))
    else:
        lines.append("%s%s: %s" % (pad, key, _yaml_scalar(value)))


def render_frontmatter(colors, categorical, size_block, rounded_block, type_block,
                       components):
    lines = ["---",
             "# Generated by build_tokens.py — do not hand-edit this token block."]
    if colors:
        lines.append("colors:")
        for k, v in colors:
            lines.append(_yaml_kv(k, v, 2))
    if categorical:
        lines.append("categorical:")
        for name, fields in categorical:
            _render_fm_node(name, fields, 2, lines)
    if size_block:
        lines.append("size:")
        for k, v in size_block:
            lines.append(_yaml_kv(k, v, 2))
    if rounded_block:
        lines.append("rounded:")
        for k, v in rounded_block:
            lines.append(_yaml_kv(k, v, 2))
    if type_block:
        lines.append("type:")
        for k, v in type_block:
            lines.append(_yaml_kv(k, v, 2))
    if components:
        lines.append("components:")
        for name, value in components:
            _render_fm_node(name, value, 2, lines)
    lines.append("---")
    return "\n".join(lines) + "\n"


def write_design_md(design_dir, frontmatter):
    """Splice the generated frontmatter into DESIGN.md, preserving any prose body."""
    path = os.path.join(design_dir, "DESIGN.md")
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as fh:
            text = fh.read()
        m = re.match(r"(?s)^---\n.*?\n---\n?", text)
        body = text[m.end():] if m else text
        new = frontmatter + body
    else:
        new = (frontmatter + "\n<!-- DESIGN.md prose body authored separately; "
               "build_tokens.py owns only the frontmatter token block above. -->\n")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(new)
    return path


# --- io ----------------------------------------------------------------------

def load_json(path):
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def load_override(design_dir, kind, name):
    path = os.path.join(design_dir, kind, name + ".json")
    if not os.path.exists(path):
        return None
    return load_json(path)


# --- main --------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("design_system_dir")
    ap.add_argument("--emit", required=True,
                    choices=["css", "design-frontmatter", "resolved",
                             "tailwind", "shadcn", "all"])
    ap.add_argument("--css-unit", choices=["rem", "px"], default="rem")
    ap.add_argument("--allow-dup-primitive", action="store_true")
    args = ap.parse_args()

    design_dir = args.design_system_dir
    tokens_path = os.path.join(design_dir, "tokens.json")
    if not os.path.exists(tokens_path):
        sys.stderr.write("ERROR: no tokens.json in %s\n" % design_dir)
        return 1

    # (a) JSON parses.
    try:
        base_tree = load_json(tokens_path)
    except (ValueError, OSError) as exc:
        sys.stderr.write("ERROR [json]: %s\n" % exc)
        return 1

    meta = base_tree.get("meta", {})
    ext_ns = meta.get("extensions", "com.design-extract")
    meta_defaults = meta.get("defaults", {})
    units = meta.get("units", {})
    default_mode = meta.get("defaultMode")
    modes = meta.get("modes", [])
    themes = meta.get("themes", [])

    base_leaves = collect_leaves(base_tree, meta_defaults, ext_ns)

    # gather override trees (for parity) — parse failures are hard errors.
    overrides = []
    try:
        for mode in modes:
            if mode == default_mode:
                continue
            otree = load_override(design_dir, "modes", mode)
            if otree is not None:
                overrides.append(("modes/%s.json" % mode, otree))
        for theme in themes:
            otree = load_override(design_dir, "themes", theme)
            if otree is not None:
                overrides.append(("themes/%s.json" % theme, otree))
    except (ValueError, OSError) as exc:
        sys.stderr.write("ERROR [json]: override parse failed: %s\n" % exc)
        return 1

    # STAGE 0 — fail closed before any emit.
    errors = validate(base_tree, base_leaves, args.allow_dup_primitive, overrides)
    errors += validate_profile2(base_tree, base_leaves)
    if errors:
        sys.stderr.write("VALIDATION FAILED (%d error%s) — no files emitted:\n"
                         % (len(errors), "" if len(errors) == 1 else "s"))
        for err in errors:
            sys.stderr.write("  ERROR %s\n" % err)
        return 1

    for warn in coverage_warnings(base_leaves, overrides):
        sys.stderr.write(warn + "\n")

    targets = ["resolved", "css", "design-frontmatter", "tailwind", "shadcn"] \
        if args.emit == "all" else [args.emit]
    written = []

    if "resolved" in targets:
        resolved = resolve_all(base_leaves)
        tree = build_resolved_tree(base_tree, base_leaves, resolved, ext_ns)
        if is_profile2(meta):
            tree["meta"]["resolvedMode"] = default_mode
        out_path = os.path.join(design_dir, "tokens.resolved.json")
        with open(out_path, "w", encoding="utf-8") as fh:
            json.dump(tree, fh, indent=2, ensure_ascii=False)
            fh.write("\n")
        written.append(out_path)
        # profile-2: one de-aliased snapshot per non-default mode that has an
        # override file, so consumers read dark values without re-resolving.
        for mode in (modes if is_profile2(meta) else []):
            if mode == default_mode:
                continue
            otree = load_override(design_dir, "modes", mode)
            if otree is None:
                continue
            otree = {k: v for k, v in otree.items() if k != "$coverage"}
            composed = deep_merge(base_tree, otree)
            cl = collect_leaves(composed, meta_defaults, ext_ns)
            mtree = build_resolved_tree(composed, cl, resolve_all(cl), ext_ns)
            mtree["meta"]["resolvedMode"] = mode
            out_path = os.path.join(design_dir, "tokens.resolved.%s.json" % mode)
            with open(out_path, "w", encoding="utf-8") as fh:
                json.dump(mtree, fh, indent=2, ensure_ascii=False)
                fh.write("\n")
            written.append(out_path)

    if "css" in targets:
        css = emit_css(base_tree, base_leaves, meta_defaults, ext_ns,
                       args.css_unit, units, default_mode, modes, themes, design_dir)
        out_path = os.path.join(design_dir, "tokens.css")
        with open(out_path, "w", encoding="utf-8") as fh:
            fh.write(css)
        written.append(out_path)

    if "tailwind" in targets:
        css = emit_tailwind(base_leaves, resolve_all(base_leaves))
        out_path = os.path.join(design_dir, "tokens.tailwind.css")
        with open(out_path, "w", encoding="utf-8") as fh:
            fh.write(css)
        written.append(out_path)

    if "shadcn" in targets:
        css = emit_shadcn(base_leaves)
        out_path = os.path.join(design_dir, "tokens.shadcn.css")
        with open(out_path, "w", encoding="utf-8") as fh:
            fh.write(css)
        written.append(out_path)

    if "design-frontmatter" in targets:
        frontmatter = build_frontmatter(base_leaves, base_tree)
        out_path = write_design_md(design_dir, frontmatter)
        written.append(out_path)

    for p in written:
        size = os.path.getsize(p)
        sys.stdout.write("wrote %s (%d bytes)\n" % (p, size))
    return 0


if __name__ == "__main__":
    sys.exit(main())
