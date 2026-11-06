import { useState } from 'react';
import type { FleetService, Service } from '../data/types';
import { duration } from '../lib/format';

type Row = Service | FleetService;

function isFleet(row: Row): row is FleetService {
  return 'node_id' in row;
}

const STATE_WORD: Record<string, string> = {
  active: 'running',
  inactive: 'inactive',
  failed: 'failed',
  activating: 'starting',
  deactivating: 'stopping',
  reloading: 'reloading',
};

export function unitTone(state: string): 'ok' | 'fail' | 'idle' {
  if (state === 'failed') return 'fail';
  if (state === 'active') return 'ok';
  return 'idle';
}

export function UnitPill({ state }: { state: string }) {
  const tone = unitTone(state);
  return (
    <span className={`unit-pill${tone === 'ok' ? ' ok' : tone === 'fail' ? ' fail' : ''}`}>
      <span className="unit-pill-dot" aria-hidden="true" />
      {STATE_WORD[state] ?? state}
    </span>
  );
}

/** The states present in the list, as filter chips with honest counts. */
export function UnitState({
  units,
  value,
  onChange,
}: {
  units: Row[];
  value?: string;
  onChange?: (next: string) => void;
}) {
  const [local, setLocal] = useState('all');
  const active = value ?? local;
  const set = onChange ?? setLocal;
  const counts: Record<string, number> = { all: units.length, failed: 0, active: 0, inactive: 0 };
  for (const unit of units) counts[unit.active_state] = (counts[unit.active_state] ?? 0) + 1;
  const all: Array<[string, string]> = [
    ['all', 'All'],
    ['failed', 'Failed'],
    ['active', 'Running'],
    ['inactive', 'Inactive'],
  ];
  const options = all.filter(([key]) => key === 'all' || (counts[key] ?? 0) > 0);
  return (
    <div className="chips" role="group" aria-label="Filter by state">
      {options.map(([key, label]) => (
        <button type="button" className="chip" key={key} aria-pressed={active === key} onClick={() => set(key)}>
          {label} <span className="chip-count">{counts[key] ?? 0}</span>
        </button>
      ))}
    </div>
  );
}

function since(value?: number): string {
  if (!value) return '—';
  const age = (Date.now() - value) / 1000;
  return age < 0 ? '—' : `${duration(age)} ago`;
}

/**
 * One row per unit: the name and its description on one line, the figures
 * right-aligned. Under 900 px the description moves under the name and the
 * remaining fields become a single subline, so no column is dropped.
 */
export function UnitTable({
  rows,
  onOpen,
  showNode = true,
  showSubState = false,
}: {
  rows: Row[];
  onOpen?: (unit: Row) => void;
  showNode?: boolean;
  showSubState?: boolean;
}) {
  if (rows.length === 0) {
    return (
      <p className="empty" role="status">
        No unit matches this filter.
      </p>
    );
  }
  return (
    <div className="table-wrap">
      <table className="table unit-table">
        <thead>
          <tr>
            <th scope="col" className="unit-dot" />
            <th scope="col">Unit</th>
            {showNode ? (
              <th scope="col" className="opt-m">
                System
              </th>
            ) : null}
            <th scope="col">State</th>
            {showSubState ? (
              <th scope="col" className="opt-t">
                Sub state
              </th>
            ) : null}
            <th scope="col" className="num opt-t">
              Restarts
            </th>
            <th scope="col" className="num">
              Changed
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((unit) => {
            const fleet = isFleet(unit);
            const nodeName = fleet ? unit.node_name : '';
            const changed = since(unit.since);
            return (
              <tr
                key={`${fleet ? unit.node_id : ''}-${unit.name}`}
                className={onOpen ? 'row-click' : undefined}
                onClick={onOpen ? () => onOpen(unit) : undefined}
              >
                <td className="unit-dot">
                  <span className="unit-dot-mark" data-tone={unitTone(unit.active_state)} aria-hidden="true" />
                </td>
                <td className="unit-name">
                  <span className="unit-cell">
                    <span className="unit-id" title={unit.name}>
                      {unit.name}
                    </span>
                    <span className="unit-desc" title={unit.description}>
                      {unit.description}
                    </span>
                    <span
                      className="unit-sub"
                      title={showNode ? [nodeName, unit.enabled].filter(Boolean).join(' · ') : changed}
                    >
                      {showNode
                        ? [nodeName, unit.enabled].filter(Boolean).join(' · ')
                        : changed}
                    </span>
                  </span>
                </td>
                {showNode ? <td className="mono opt-m">{nodeName || '—'}</td> : null}
                <td>
                  <UnitPill state={unit.active_state} />
                </td>
                {showSubState ? <td className="mono opt-t">{unit.sub_state || '—'}</td> : null}
                <td className="num opt-t">{unit.restarts ? `${unit.restarts}×` : '0'}</td>
                <td className="num mono">{changed}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
