# Assets and attribution

## Agent marks

`web/public/agents/*.svg` are copied from Warren’s preset icon set:

```
warren/Packages/WarrenIOS/Sources/WarrenIOS/Resources/PresetIcons.xcassets
```

Files: `codex`, `claude`, `pi`, `opencode`, `qoder`, `antigravity`, `trae`,
`shell`, `zsh`.

Use them to identify the tools an operator is already running. They are not
Cupola’s marks, and no endorsement is implied. Product names and logos are
trademarks of their respective owners. Warren is licensed under
FSL-1.1-ALv2; Cupola is not a competing product. If a mark’s owner asks for
removal, remove it and fall back to the neutral terminal glyph.

Render them as monochrome CSS masks (`mask-image`) at 16 px, in `--muted` and
`--text`, never in tinted squares. Do not recolour them. In this build the
registry is `web/src/data/registry.ts` and the renderer
`web/src/components/AgentMark.tsx`.

Missing types (Cursor, Aider, Gemini, Goose, Cline, Roo, Continue, Ollama,
vLLM, ComfyUI) use the neutral `shell.svg` and the type name until a licensed,
sourceable mark is added. Do not draw fake brand marks.

## Fonts

- Public Sans — SIL Open Font License 1.1.
- IBM Plex Mono — SIL Open Font License 1.1.

Self-hosted subset WOFF2 files live in `web/public/fonts/`:

```
public-sans-400.woff2  public-sans-500.woff2
public-sans-600.woff2  public-sans-700.woff2
ibm-plex-mono-400.woff2  ibm-plex-mono-500.woff2
OFL-PublicSans.txt  OFL-IBMPlexMono.txt
```

Copied from the npm packages `@fontsource/public-sans` and
`@fontsource/ibm-plex-mono` (5.3.0 packaging, Latin subset). The licence files
shipped by those packages are committed next to the faces. There are no runtime
font requests; the faces are preloaded in `web/index.html` and cached by the
service worker.

## Cupola mark and PWA icons

`web/public/icons/favicon.svg` is drawn for this project (a cupola: dome, two
columns, base). `scripts/gen-icons.mjs` rasterises it into the 192/512/1024 and
maskable 512 PNGs with Playwright; the PNGs are committed. Run `npm run icons`
after changing the mark.

## Design direction

`docs/design/direction.json` is the dealt tasteskill v2 app sheet (seed
`956138436`, style `data-terminal`). The skill is MIT-licensed:
`https://github.com/Leonxlnx/taste-skill`.

## Screenshots

`docs/screenshots/overview.png` is the production build on the demo hub
(`atlas`, `beelink`, `studio`), so every figure in it is invented.
