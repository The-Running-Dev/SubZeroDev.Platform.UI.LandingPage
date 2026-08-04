export const baseCss = `:root {
  --szd-bg: #f7f7f8;
  --szd-surface: #ffffff;
  --szd-text: #17202a;
  --szd-muted: #5a6570;
  --szd-accent: #2457c5;
  --szd-border: #d5d9de;
  --szd-measure: 72rem;
  color: var(--szd-text);
  background: var(--szd-bg);
  font-family: ui-sans-serif, system-ui, sans-serif;
}
* { box-sizing: border-box; }
body { margin: 0; }
a { color: var(--szd-accent); }
a:focus-visible { outline: 2px solid var(--szd-accent); outline-offset: 3px; }
.szd-shell { margin: 0 auto; max-width: var(--szd-measure); padding: 0 1rem; }
.szd-header, .szd-footer { border-color: var(--szd-border); border-style: solid; }
.szd-header { border-width: 0 0 1px; display: flex; gap: 1rem; justify-content: space-between; padding: 1rem 0; }
.szd-brand { color: var(--szd-text); font-weight: 700; text-decoration: none; }
.szd-nav { display: flex; gap: 1rem; }
.szd-main { padding: 2.5rem 0; }
.szd-article { background: var(--szd-surface); border: 1px solid var(--szd-border); border-radius: 0.25rem; padding: clamp(1rem, 3vw, 3rem); }
.szd-article > *:first-child { margin-top: 0; }
.szd-article h1, .szd-article h2, .szd-article h3 { line-height: 1.15; }
.szd-article p, .szd-article li { line-height: 1.6; }
.szd-article pre { background: #15191f; color: #eef2f5; overflow-x: auto; padding: 1rem; }
.szd-article code { font-family: ui-monospace, Consolas, monospace; }
.szd-article table { border-collapse: collapse; display: block; max-width: 100%; overflow-x: auto; }
.szd-article th, .szd-article td { border: 1px solid var(--szd-border); padding: 0.5rem; text-align: left; }
.szd-footer { border-width: 1px 0 0; color: var(--szd-muted); padding: 1.5rem 0; }
.szd-skip-link { left: -999px; position: absolute; }
.szd-skip-link:focus { background: var(--szd-surface); left: 1rem; padding: .5rem; top: 1rem; z-index: 1; }
`;
