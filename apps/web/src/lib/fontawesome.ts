import { config } from "@fortawesome/fontawesome-svg-core";

// Font Awesome Free, bundled locally (no CDN) via @fortawesome/react-fontawesome
// + free-solid-svg-icons — icons render as inline SVG (tree-shaken per-icon
// import), so there's no @font-face/webfont file to package or host, and
// nothing external for a packaged desktop build to reach at runtime.
// autoAddCss must be turned off *before* any <FontAwesomeIcon> renders (this
// module is imported once, first, from app/layout.tsx) — otherwise the
// library injects its own <style> tag at mount time, which both duplicates
// the explicit stylesheet import below and causes a visible icon-size flash
// on first paint.
config.autoAddCss = false;
