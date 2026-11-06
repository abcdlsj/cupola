import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useNavigate } from 'react-router-dom';
import { useFleet } from '../data/queries';
import { StatusPill } from './StatusPill';
import type { NodeStatus } from '../data/types';

interface Item {
  id: string;
  label: string;
  group: 'Go to' | 'Nodes';
  to: string;
  hint?: string;
  status?: NodeStatus;
}

const SCREENS: Item[] = [
  { id: 'screen-systems', label: 'Systems', group: 'Go to', to: '/' },
  { id: 'screen-services', label: 'Services', group: 'Go to', to: '/services' },
  { id: 'screen-apps', label: 'Apps', group: 'Go to', to: '/apps' },
  { id: 'screen-events', label: 'Events', group: 'Go to', to: '/events' },
  { id: 'screen-alerts', label: 'Alerts', group: 'Go to', to: '/alerts' },
  { id: 'screen-settings', label: 'Settings', group: 'Go to', to: '/settings/nodes' },
];

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate();
  const fleet = useFleet();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const items = useMemo<Item[]>(() => {
    const nodes: Item[] = (fleet.data?.nodes ?? []).map((view) => ({
      id: `node-${view.node.id}`,
      label: view.node.name,
      group: 'Nodes',
      to: `/nodes/${view.node.id}`,
      hint: view.health.status === 'offline' ? 'offline' : `${Math.round(view.health.cpu_pct)}% CPU`,
      status: view.health.status,
    }));
    const all = [...SCREENS, ...nodes];
    const needle = query.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((item) => `${item.label} ${item.hint ?? ''}`.toLowerCase().includes(needle));
  }, [fleet.data, query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
    }
  }, [open]);

  useEffect(() => setActive(0), [query]);

  const go = (item: Item | undefined) => {
    if (!item) return;
    onOpenChange(false);
    navigate(item.to);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => Math.min(items.length - 1, index + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => Math.max(0, index - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      go(items[active]);
    }
  };

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  let lastGroup: string | null = null;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay" />
        <Dialog.Content className="dialog palette" aria-describedby={undefined}>
          <Dialog.Title className="sr-only">Search nodes and screens</Dialog.Title>
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search nodes and screens"
            aria-label="Search nodes and screens"
            aria-controls="palette-list"
            aria-activedescendant={items[active] ? `palette-${items[active].id}` : undefined}
            role="combobox"
            aria-expanded="true"
          />
          <div className="palette-list" id="palette-list" role="listbox" ref={listRef}>
            {items.length === 0 ? <p className="empty">No node or screen matches “{query}”.</p> : null}
            {items.map((item, index) => {
              const header = item.group !== lastGroup ? item.group : null;
              lastGroup = item.group;
              return (
                <div key={item.id}>
                  {header ? <div className="palette-group">{header}</div> : null}
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === active}
                    id={`palette-${item.id}`}
                    className="palette-item"
                    data-active={index === active ? 'true' : undefined}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => go(item)}
                  >
                    <span>{item.label}</span>
                    {item.status ? (
                      <span className="palette-hint">
                        <StatusPill status={item.status} />
                      </span>
                    ) : item.hint ? (
                      <span className="palette-hint">{item.hint}</span>
                    ) : null}
                  </button>
                </div>
              );
            })}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
