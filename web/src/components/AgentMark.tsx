import type { CSSProperties } from 'react';
import { agentMarkSrc } from '../data/registry';
import type { AgentType } from '../data/schema';

/**
 * Warren's preset mark as a monochrome CSS mask at 16px: --muted at rest,
 * --text when selected or hovered. Never a tinted square, never a brand colour.
 */
export function AgentMark({ type, strong = false }: { type: AgentType; strong?: boolean }) {
  const style = { '--mark': `url(${agentMarkSrc(type)})` } as CSSProperties;
  return <span className="agent-mark" data-tone={strong ? 'strong' : undefined} style={style} aria-hidden="true" />;
}
