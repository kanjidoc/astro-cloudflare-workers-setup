# DESIGN.md: the format, for writing one

Condensed from the google-labs-code/design.md spec (`version: alpha`, `main` as of 2026-11-05: https://github.com/google-labs-code/design.md/blob/main/docs/spec.md). The site's generator (`scripts/design-tokens.mjs`) reads it; the official `@google/design.md` CLI is not used.

One file at the repo root: YAML tokens, then Markdown prose. **The tokens are normative; the prose gives context** (why, when, how to apply them). Prose may name colors descriptively ("Midnight Forest Green") for tokens named systematically (`primary`).

Tokens go in front matter (between lines that are exactly `---`), in fenced ```` ```yaml ```` blocks inside the sections, or both. All blocks merge into one tree. **Each top-level key may appear once in the whole file**: the stub's front matter has `colors: {}` etc., so moving `colors` into a block under `## Colors` means deleting it from the front matter.

## Token schema
```yaml
version: alpha            # optional
name: <string>
description: <string>     # optional
omitted: [<section> | {section, reason}]   # optional: sections left out on purpose
colors:     { <name>: <Color> }
typography: { <name>: { fontFamily, fontSize, fontWeight, lineHeight, letterSpacing, fontFeature, fontVariation } }
rounded:    { <level>: <Dimension> }
spacing:    { <level>: <Dimension | number> }
components: { <name>: { backgroundColor, textColor, typography, rounded, padding, size, height, width } }
```

- **`colors.primary` is required** by the spec; every other token is optional.
- **Color:** any CSS color string: hex (`#RGB`, `#RRGGBB`, with alpha), named, `rgb()`/`hsl()`/`hwb()`, `oklch()`/`oklab()`/`lch()`/`lab()`, `color-mix()`. `#RRGGBB` is the recommended default. **Always quote hex**: an unquoted `#` starts a YAML comment.
- **Dimension:** a string with `px`, `em` or `rem`. In `spacing` the spec also allows a bare number, which it treats as unitless (a count or a ratio, not a length).
- **Typography:** `fontFamily` string; `fontSize` Dimension; `fontWeight` number (`600` or `"600"`); `lineHeight` Dimension or unitless multiplier; `letterSpacing` Dimension; `fontFeature` → `font-feature-settings`; `fontVariation` → `font-variation-settings`. All optional.
- **References:** `{group.token}` points at another value (`"{colors.primary}"`, `"{spacing.md}"`). Outside `components` a reference must reach a single value, never a group. Composite references (`{typography.label-md}`) are allowed only inside `components`.
- **Variants** are sibling keys: `button-primary`, `button-primary-hover`.
- `components` guide agents and linters; the generator does not turn them into CSS. Claude styles components from them by hand (scoped `<style>`).

## Recommended names (use them unless the material dictates others)
- **colors:** `primary`, `secondary`, `tertiary`, `neutral`, `surface`, `on-surface`, `error`. Add `on-primary` (and `on-<x>` for any color text sits on); the social card reads `on-primary`.
- **typography:** `headline-display`, `headline-lg`, `headline-md`, `body-lg`, `body-md`, `body-sm`, `label-lg`, `label-md`, `label-sm`. The `/design/` sample page uses these roles.
- **rounded:** `none`, `sm`, `md`, `lg`, `xl`, `full`. **spacing:** `xs`, `sm`, `md`, `lg`, `xl` are common (plus layout values such as `gutter`, `margin`).

## Our rules on top of the spec
- **References** may chain; a cycle or a missing target is an error, inside `components` too.
- **Quote every `lineHeight`** (`"1.5"`): the official tooling silently drops an unquoted number. The generator warns when it sees one.
- **Dark mode = `-dark` siblings.** `primary-dark` is the dark-scheme value of `primary`. The generator emits it under `@media (prefers-color-scheme: dark)` and sets `color-scheme: light dark`. Give a `-dark` value to every color that should change; a color without one keeps its light value in both schemes (references resolve to literals, so `on-surface: "{colors.primary}"` does not follow `primary-dark`). A `-dark` name with no base color is an ordinary color. No extra top-level keys.
- **Fonts:** `fontFamily` starts with the Astro Fonts API variable, with the family as its fallback: `"var(--font-body, Source Sans 3, sans-serif)"`. The generator quotes family names (`"Source Sans 3"`) and leaves generic families and functions alone.
- **Spacing:** a bare number passes through unchanged, unitless as the spec says (`columns: 12` → `12`), and the generator warns; write `8px` for a length. **Rounded:** a bare number becomes `px` (`4` → `4px`; `0` stays `0`).
- **Typography:** `fontSize` and `letterSpacing` need a unit (`16px`, `-0.02em`); a bare number is an error.

## Sections (all optional; those present keep this order; `##` headings)

| # | Section | Also accepted | Holds |
| :-- | :-- | :-- | :-- |
| 1 | Overview | Brand & Style | personality, audience, the feeling; the fallback guide when no token answers |
| 2 | Colors | | each palette's role in words |
| 3 | Typography | | the pairing and each role's use |
| 4 | Layout | Layout & Spacing | grid or flow model, max width, rhythm |
| 5 | Elevation & Depth | Elevation | shadows (spread, blur, color) or the flat alternative |
| 6 | Shapes | | corner language |
| 7 | Components | | buttons, inputs, lists, cards: states and variants |
| 8 | Do's and Don'ts | | the user's hard rules, as `- Do …` / `- Don't …` |

An optional `#` title is allowed. Unknown `##` sections and `###` subsections are preserved; a duplicate `##` section is an error. **The spec has no tokens for motion, elevation values, imagery or voice**: write them as prose (`### Motion` under Components, `### Imagery` under Overview).

## Minimal complete example

```markdown
---
version: alpha
name: Harbour Books
description: A small independent bookshop. Warm, quiet, bookish.
colors:
  primary: "#7A2E1F"
  on-primary: "#FFF8F0"
  surface: "#FBF7F0"
  on-surface: "#2B2420"
  primary-dark: "#E8A08F"
  on-primary-dark: "#2B1410"
  surface-dark: "#1C1916"
  on-surface-dark: "#EDE6DC"
typography:
  headline-display:
    fontFamily: "var(--font-display, Fraunces, serif)"
    fontSize: 3rem
    fontWeight: 600
    lineHeight: "1.1"
    letterSpacing: -0.01em
  body-md:
    fontFamily: "var(--font-body, Source Sans 3, sans-serif)"
    fontSize: 1rem
    fontWeight: 400
    lineHeight: "1.6"
  label-md:
    fontFamily: "{typography.body-md.fontFamily}"
    fontSize: 0.875rem
    fontWeight: 600
    lineHeight: "1.2"
    letterSpacing: 0.04em
rounded:
  sm: 4px
spacing:
  sm: 8px
  md: 16px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.sm}"
    padding: 12px
---

## Overview
A shop you'd linger in: paper, ink and lamplight. Calm, generous margins; nothing shouts.
## Colors
- **Primary (#7A2E1F):** oxblood, for links and the one main action per page.
- **Surface (#FBF7F0):** cream paper. Dark scheme: a warm near-black with parchment text.
## Do's and Don'ts
- Do keep body text at or above 4.5:1 contrast in both schemes.
- Don't use more than one accent per view.
```

## The three mistakes that break tooling
1. **Duplicate top-level keys** (the same group in front matter and a block, or twice in one block): the file is rejected.
2. **Unquoted `lineHeight`** (or an unquoted `#hex`, which becomes a comment): values silently vanish.
3. **References to tokens that don't exist** (typos, a renamed token): the generator stops and names the token.
