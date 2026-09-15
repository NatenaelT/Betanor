# Proposed Design System

## Current state

The master specification prescribes Deep Navy/Blue, Gold, White, electric-blue accents, and light-neutral surfaces; it describes a stylized pixel-fragment `B` logo with gold doorway/opening. However, no official logo, letterhead, color values, typography, iconography, or other brand asset exists in the repository or supplied attachment. No visual design should be treated as approved until the asset pack is supplied.

## Proposed foundations

- Establish `--betanor-navy`, `--betanor-dark-navy`, `--betanor-blue`, `--betanor-electric-blue`, `--betanor-gold`, `--betanor-light-gold`, `--betanor-white`, `--betanor-surface`, `--betanor-muted`, `--betanor-text`, `--betanor-border`, `--betanor-success`, `--betanor-warning`, and `--betanor-danger`, alongside spacing, typography, radii, elevation, and motion tokens—not scattered literal values.
- Create light/dark and high-contrast accessible palettes from approved brand colors; meet WCAG 2.2 AA contrast.
- Use a data-dense but calm operational-app layout: persistent navigation, contextual breadcrumbs, filters, tables, detail panels, approval timelines, and responsive mobile task actions.
- Build reusable primitives for status badges, money/date fields, entity links, document version indicators, approval cards, audit timelines, empty/error states, and permission-denied states.
- Separate public RFQ/customer-portal experience from the staff workspace while retaining shared brand tokens.

## Phase 2 implemented foundation

The current implementation centralizes the initial palette in `src/app/globals.css` and provides framework-agnostic, Tailwind-based primitives in `src/components/ui`:

- `Button`: primary, gold, outline, ghost, and destructive variants; small, medium, and large sizes; visible keyboard focus and disabled state.
- `Card`: a standard operational surface with header/content regions.
- `Input`, `FieldLabel`, and `FieldHint`: labelled, focus-visible form controls and consistent help text.
- `Badge`: neutral, draft, review, success, warning, and danger states.
- `TableWrap` and `Table`: responsive horizontal table containment for data-dense workspace screens.
- `Drawer`: an escape-dismissible, overlay-dismissible mobile navigation shell. It is used by the workspace navigation, while desktop retains the persistent sidebar.

`/workspace/style-guide` is an internal visual reference for these primitives. It contains illustrative data only and is not a product module. Screens added in later phases should compose these primitives rather than duplicate their visual states.

The approved `Betanor Logo_V1.0.png` is now used by `BetanorMark` in the public and workspace navigation. It is stored as `public/betanor-logo-v1.png` without modification. Obtain an approved SVG or reversed logo variant before any high-resolution print use or dark-background treatment where the white PNG canvas would be unsuitable.

## Brand intake required

Obtain source logo variants (SVG preferred), letterhead, brand guide, approved colors/fonts, imagery policy, and document/PDF examples. Record asset provenance and licenses. Do not extract a logo from low-resolution letterhead if a vector master is available.
