# Kriyan Web Design System

## Theme

A restrained operational workspace: near-neutral daylight surfaces with a deep graphite dark theme, pine-green primary actions, and semantic color reserved for real system state. The UI follows the operating-system theme.

## Typography

- Geist Sans for all product UI, using a compact fixed type scale.
- Geist Mono only for IDs, event sequence numbers, and machine-facing metadata.
- Headings are sentence case with balanced wrapping; body copy stays below 72 characters where practical.

## Color

- Canvas and surface colors are neutral with a subtle green hue.
- Pine is reserved for primary actions, focus, current navigation, and confirmed success.
- Amber means queued, waiting, or reconnecting; blue means active work; red means failed or destructive.
- Every status includes text or an icon in addition to color.

## Shape and depth

- Controls use 8–10px radii; sections use 12–14px radii.
- Borders define structure. Shadows are limited to overlays and the command composer focus state.
- No decorative glass, gradient text, oversized rounding, or nested cards.

## Layout

- Desktop: compact left rail, centered Today column, contextual activity rail.
- Phone: top identity/status bar, single-column content, bottom navigation.
- Today uses open sections and ruled lists instead of a repeated card grid.

## Components

- Buttons have primary, secondary, quiet, and danger treatments with consistent focus/disabled/busy states.
- Status chips use a dot, plain-language label, and optional detail.
- Forms stay inline whenever possible; editing expands in place rather than opening a modal.
- Loading uses structural skeletons. Empty states teach the first action. Errors preserve user input and expose retry.

## Motion

Use 160–220ms ease-out transitions only for state change and disclosure. Disable nonessential movement under `prefers-reduced-motion`.
