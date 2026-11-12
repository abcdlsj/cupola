import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFleet } from '../data/queries';
import type { NodeStatus } from '../data/types';
import { statusLabel, statusTone } from './StatusPill';
import { StatusDot } from '../ui/primitives';

interface Entry {
  id: string;
  label: string;
  group: 'Screens' | 'Systems';
  to: string;
  hint?: string;
  status?: NodeStatus;
}

const SCREENS: Entry[] = [
  ['Systems', '/'],
  ['Services', '/services'],
  ['Apps', '/apps'],
  ['Alerts', '/alerts'],
  ['Events', '/events'],
  ['Settings', '/settings/nodes'],
].map(([label, to]) => ({ id: `screen:${to}`, label, group: 'Screens', to }));

/**
 * ⌘K: one field, two groups. The browser owns the modal frame; the list is a
 * listbox so the arrow keys, the screen reader and the tests all agree.
 */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate();
  const fleet = useFleet();
  const dialog = useRef<HTMLDialogElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  const entries = useMemo<Entry[]>(() => {
    const nodes = (fleet.data?.nodes ?? []).map<Entry>((view) => ({
      id: `node:${view.node.id}`,
      label: view.node.name,
      group: 'Systems',
      to: `/nodes/${view.node.id}`,
      status: view.health.status,
      hint:
        view.health.status === 'offline'
          ? 'offline'
          : `${Math.round(view.health.cpu_pct)}% CPU · ${Math.round(view.health.mem_pct)}% memory`,
    }));
    return [...SCREENS, ...nodes];
  }, [fleet.data]);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return entries;
    return entries.filter((entry) => `${entry.label} ${entry.hint ?? ''}`.toLowerCase().includes(needle));
  }, [entries, query]);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      setQuery('');
      setActive(0);
      element.showModal();
      field.current?.focus();
    } else if (!open && element.open) {
      element.close();
    }
  }, [open]);

  useEffect(() => setActive(0), [query]);

  const choose = (entry: Entry | undefined) => {
    if (!entry) return;
    onOpenChange(false);
    navigate(entry.to);
  };

  const move = (delta: number) => {
    if (shown.length === 0) return;
    setActive((current) => (current + delta + shown.length) % shown.length);
  };

  let lastGroup = '';

  return (
    <dialog
      ref={dialog}
      className="palette"
      aria-label="Search systems and screens"
      onCancel={(event) => {
        event.preventDefault();
        onOpenChange(false);
      }}
      onClick={(event) => {
        if (event.target === dialog.current) onOpenChange(false);
      }}
    >
      <div className="palette-field">
        <input
          ref={field}
          type="text"
          role="combobox"
          aria-label="Search systems and screens"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-autocomplete="list"
          aria-activedescendant={shown[active] ? `palette-${shown[active].id}` : undefined}
          placeholder="Search a system or a screen…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              move(1);
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              move(-1);
            } else if (event.key === 'Enter') {
              event.preventDefault();
              choose(shown[active]);
            }
          }}
        />
        <span className="muted small">esc</span>
      </div>

      <div className="palette-list" role="listbox" id="palette-list" aria-label="Results">
        {shown.length === 0 ? (
          <p className="palette-empty">No screen or system matches.</p>
        ) : (
          shown.map((entry, index) => {
            const heading = entry.group !== lastGroup ? entry.group : null;
            lastGroup = entry.group;
            return (
              <div key={entry.id}>
                {heading ? <div className="palette-group">{heading}</div> : null}
                <button
                  type="button"
                  id={`palette-${entry.id}`}
                  role="option"
                  aria-selected={index === active}
                  className="palette-item"
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(entry)}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {entry.status ? <StatusDot variant={statusTone(entry.status)} label={statusLabel(entry.status)} /> : null}
                    {entry.label}
                  </span>
                  {entry.hint ? <span className="hint">{entry.hint}</span> : null}
                </button>
              </div>
            );
          })
        )}
      </div>

      <div className="palette-foot">
        <span>↑ ↓ to move</span>
        <span>↵ to open</span>
        <span>esc to close</span>
      </div>
    </dialog>
  );
}
