# ai-toys

A collection of small, single-usage static tools hosted on GitHub Pages (https://jlugagne.github.io/ai-toys/). No backend, no build step — plain HTML/CSS/JS, deployed via the GitHub Actions workflow in `.github/workflows/pages.yml` on every push to `main`.

## Adding a new tool

1. Create a folder at the repo root named after the tool (e.g. `my-tool/`), with at least an `index.html`.
2. Link the shared stylesheet from `assets/style.css` alongside a tool-specific `style.css` (see below).
3. Add an entry to the `tool-list` in the root `index.html`.
4. Everything must run fully client-side — no server calls, no analytics, no CDN dependencies. Vendor any third-party library locally (see `photo-frame-pdf/vendor/`).

## Shared design system

All tools must use the same color scheme, defined once in `assets/style.css` as CSS custom properties, and reused (never redefined) by every per-tool `style.css`:

```css
:root {
  color-scheme: light dark;
  --bg: #ffffff;
  --fg: #1a1a1a;
  --accent: #3b6fd6;
  --border: #dddddd;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #12141a;
    --fg: #eaeaea;
    --accent: #7aa2ff;
    --border: #333333;
  }
}
```

Rules:

- **Do not introduce a new palette per tool.** No custom accent colors, no warm/paper tones, no per-tool `:root` overrides of `--bg`/`--fg`/`--accent`/`--border`. Every tool must look like part of the same site.
- **Typography**: system font stack only (`system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`, as set on `body` in `assets/style.css`). No serif display faces, no vendored/Google web fonts — keep the site fully offline and consistent.
- A tool's own `style.css` is for **layout and component structure specific to that tool** (grids, controls, canvas/preview panes, responsive breakpoints) — not for reskinning colors or type.
- Link both stylesheets in that order: `<link rel="stylesheet" href="../assets/style.css" />` then `<link rel="stylesheet" href="style.css" />`.
- `body.wide` (in the tool's own CSS) is the established pattern for tools that need more than the default `720px` reading-width max — see `photo-frame-pdf/style.css`.
- Use `var(--accent)` for hover/focus states and primary actions; use `var(--border)` for hairlines/dividers; do not hardcode hex colors for anything that should track light/dark mode.

## Responsiveness

Tools must be genuinely responsive, not just stack at one breakpoint:

- Never hardcode a fixed pixel size for a layout element (e.g. a canvas preview) in JS or CSS. Compute sizes from the actual container's `clientWidth`/viewport at runtime (see `photo-frame-pdf/app.js`'s `getPreviewSize()` for the pattern: read the wrapper's live width, derive height from content aspect ratio, clamp against viewport height).
- Use fluid units (`clamp()`, `%`, `minmax()` in grid tracks) over fixed breakpoints where possible.
- Test by resizing the browser window down to mobile widths, not just by reading the CSS.

## Testing a tool locally

No build step is needed. From the repo root:

```
python3 -m http.server 8093
```

Then open `http://localhost:8093/<tool-name>/index.html`. Restart the server after structural changes if the port was already bound.

## Other conventions

- No footer/"Source on GitHub" link on individual tool pages — keep tool pages focused on the tool itself. A back-link to the homepage (`&larr; AI Toys`) is enough.
- MIT licensed (see `LICENSE`).
- All generated file content (UI copy, code comments, commit messages) must be in English, even if the request describing the tool was made in French.
