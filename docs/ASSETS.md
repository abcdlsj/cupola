# Assets and attribution

## Fonts

- IBM Plex Sans — SIL Open Font License 1.1.
- IBM Plex Mono — SIL Open Font License 1.1.

Self-hosted subset WOFF2 files live in `web/public/fonts/`:

```
ibm-plex-sans-400.woff2  ibm-plex-sans-500.woff2
ibm-plex-sans-600.woff2  ibm-plex-sans-700.woff2
ibm-plex-mono-400.woff2  ibm-plex-mono-500.woff2
OFL-IBMPlexSans.txt  OFL-IBMPlexMono.txt
```

Copied from the npm packages `@fontsource/ibm-plex-sans` and
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
