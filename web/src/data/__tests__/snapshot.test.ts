import { describe, expect, it } from 'vitest';
import { filledNode } from '../queries';
import type { NodeView, Snapshot } from '../types';

function view(snapshot: Partial<Snapshot>): NodeView {
  return {
    node: { id: 'beelink', name: 'beelink' },
    health: { state: 'online' },
    snapshot: { ts: 1, ...snapshot } as Snapshot,
  } as unknown as NodeView;
}

const EMPTY: Partial<Snapshot> = {
  disks: [],
  network: [],
  processes: [],
  agents: [],
  ports: [],
  services: [],
  containers: [],
  images: [],
  sensors: [],
  gpus: [],
  smart: [],
  users: [],
};

describe('filledNode', () => {
  it('replaces a null section with an empty array', () => {
    // A Go nil slice arrives as JSON null; every node screen reads .length.
    const patched = filledNode(view({ agents: null as unknown as Snapshot['agents'] }));
    expect(patched.snapshot?.agents).toEqual([]);
    expect(filledNode(view({ agents: null as unknown as Snapshot['agents'] })).snapshot?.agents.length).toBe(0);
  });

  it('keeps the sections that did arrive, and the same object when nothing is null', () => {
    const clean = view({ ...EMPTY });
    expect(filledNode(clean)).toBe(clean);

    const partial = view({ smart: null as unknown as Snapshot['smart'], disks: [{ mount: '/' } as never] });
    const patched = filledNode(partial);
    expect(patched.snapshot?.smart).toEqual([]);
    expect(patched.snapshot?.disks).toEqual([{ mount: '/' }]);
  });

  it('leaves a view without a snapshot alone', () => {
    const bare = { node: { id: 'x' }, health: {} } as unknown as NodeView;
    expect(filledNode(bare)).toBe(bare);
  });
});
