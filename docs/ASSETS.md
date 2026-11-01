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
`--text`, never in tinted squares. Do not recolour them.

Missing types (Cursor, Aider, Gemini, Goose, Cline, Roo, Continue, Ollama,
vLLM, ComfyUI) use the neutral `shell.svg` and the type name until a licensed,
sourceable mark is added. Do not draw fake brand marks.

## Fonts

- Public Sans — SIL Open Font License 1.1.
- IBM Plex Mono — SIL Open Font License 1.1.

Self-host subset WOFF2 files under `web/public/fonts/`; no runtime Google Fonts
requests. Record the exact font version and license file.

## Design direction

`docs/design/direction.json` is the dealt tasteskill v2 app sheet (seed
`956138436`, style `data-terminal`). The skill is MIT-licensed:
`https://github.com/Leonxlnx/taste-skill`.
