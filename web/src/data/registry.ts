/**
 * The only custom registry in Cupola: which processes are AI agents. Marks are
 * Warren's preset SVGs in `web/public/agents`, rendered as monochrome masks.
 * A type without a licensed mark falls back to the neutral terminal glyph.
 */

export interface AgentTypeInfo {
  label: string;
  category: string;
}

const TYPES: Record<string, AgentTypeInfo> = {
  codex: { label: 'Codex', category: 'coding agent' },
  claude: { label: 'Claude Code', category: 'coding agent' },
  pi: { label: 'Pi', category: 'coding agent' },
  opencode: { label: 'OpenCode', category: 'coding agent' },
  qoder: { label: 'Qoder', category: 'coding agent' },
  antigravity: { label: 'Antigravity', category: 'coding agent' },
  trae: { label: 'Trae', category: 'coding agent' },
  cursor: { label: 'Cursor', category: 'coding agent' },
  aider: { label: 'Aider', category: 'coding agent' },
  gemini: { label: 'Gemini CLI', category: 'coding agent' },
  goose: { label: 'Goose', category: 'coding agent' },
  cline: { label: 'Cline', category: 'coding agent' },
  roo: { label: 'Roo Code', category: 'coding agent' },
  continue: { label: 'Continue', category: 'coding agent' },
  ollama: { label: 'Ollama', category: 'model server' },
  vllm: { label: 'vLLM', category: 'model server' },
  comfyui: { label: 'ComfyUI', category: 'image server' },
  shell: { label: 'Shell', category: 'terminal' },
  zsh: { label: 'Zsh', category: 'terminal' },
  bash: { label: 'Bash', category: 'terminal' },
};

const MARKS = new Set([
  'antigravity',
  'claude',
  'codex',
  'opencode',
  'pi',
  'qoder',
  'shell',
  'trae',
  'zsh',
]);

export function agentTypeInfo(type: string): AgentTypeInfo {
  const known = TYPES[type];
  if (known) return known;
  if (!type) return { label: 'Unknown', category: 'agent' };
  return { label: type.charAt(0).toUpperCase() + type.slice(1), category: 'agent' };
}

/** Always returns a bundled asset; never draws a mark we do not ship. */
export function agentMarkSrc(type: string): string {
  const key = MARKS.has(type) ? type : 'shell';
  return `${import.meta.env.BASE_URL}agents/${key}.svg`;
}
