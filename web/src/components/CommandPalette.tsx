import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  HardDrives,
  ListBullets,
  MagnifyingGlass,
  PlayCircle,
  Rows,
  SlidersHorizontal,
  type Icon,
} from '@phosphor-icons/react';
import { useFleet } from '../data/queries';
import type { NodeStatus } from '../data/types';

interface Item {
  id: string;
  label: string;
  group: 'Screens' | 'Systems';
  to: string;
  icon: Icon;
  /** the CPU figure, always shown */
  hint?: string;
  /** the memory figure, dropped on a phone where the row is narrow */
  mem?: string;
  status?: NodeStatus;
}

const SCREENS: Item[] = [
  { id: 'screen-systems', label: 'Systems', group: 'Screens', to: '/', icon: HardDrives },
  { id: 'screen-services', label: 'Services', group: 'Screens', to: '/services', icon: Rows },
  { id: 'screen-apps', label: 'Apps', group: 'Screens', to: '/apps', icon: PlayCircle },
  { id: 'screen-alerts', label: 'Alerts', group: 'Screens', to: '/alerts', icon: Bell },
  { id: 'screen-events', label: 'Events', group: 'Screens', to: '/events', icon: ListBullets },
  {
    id: 'screen-settings',
    label: 'Settings',
    group: 'Screens',
    to: '/settings/nodes',
    icon: SlidersHorizontal,
  },
];

/**
 * Command palette. One field, two groups, arrow keys and Enter. The selected
 * row is the accent bar on its left edge, the same mark the rail uses, so the
 * palette never needs an inverse block to say where the cursor is.
 */
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
      group: 'Systems',
      to: `/nodes/${view.node.id}`,
      icon: HardDrives,
      hint:
        view.health.status === 'offline'
          ? 'offline'
          : `${Math.round(view.health.cpu_pct)}% CPU`,
      mem: view.health.status === 'offline' ? undefined : `· ${Math.round(view.health.mem_pct)}% memory`,
      status: view.health.status,
    }));
    const all = [...SCREENS, ...nodes];
    const needle = query.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((item) => `${item.label} ${item.hint ?? ''} ${item.mem ?? ''}`.toLowerCase().includes(needle));
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
          <Dialog.Title className="sr-only">Search systems and screens</Dialog.Title>
          <div className="palette-field">
            <MagnifyingGlass size={16} aria-hidden="true" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search systems and screens"
              aria-label="Search systems and screens"
              aria-controls="palette-list"
              aria-activedescendant={items[active] ? `palette-${items[active].id}` : undefined}
              role="combobox"
              aria-expanded="true"
            />
            <kbd className="palette-esc">esc</kbd>
          </div>
          <div className="palette-list" id="palette-list" role="listbox" ref={listRef}>
            {items.length === 0 ? (
              <p className="palette-empty">Nothing matches “{query}”.</p>
            ) : null}
            {items.map((item, index) => {
              const header = item.group !== lastGroup ? item.group : null;
              lastGroup = item.group;
              const Icon = item.icon;
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
                    <Icon size={15} aria-hidden="true" className="palette-icon" />
                    <span className="palette-label">{item.label}</span>
                    {item.hint ? (
                      <span className="palette-hint">
                        {item.hint}
                        {item.mem ? <span className="palette-mem">{item.mem}</span> : null}
                        {item.status ? <span className="palette-dot" data-tone={item.status} /> : null}
                      </span>
                    ) : null}
                  </button>
                </div>
              );
            })}
          </div>
          <div className="palette-foot">
            <span>
              <kbd>↑</kbd>
              <kbd>↓</kbd> to move
            </span>
            <span>
              <kbd>↵</kbd> to open
            </span>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
