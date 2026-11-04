import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Event } from '../../../data/types';

const EVENTS: Event[] = [
  { id: 5, node_id: 'beelink', ts: Date.now() - 60_000, kind: 'network', severity: 'info', message: 'New listening port 44087/udp (Plex Media Serv)' },
  { id: 4, node_id: 'beelink', ts: Date.now() - 120_000, kind: 'network', severity: 'info', message: 'New listening port 34206/udp (Plex Media Serv)' },
  { id: 3, node_id: 'beelink', ts: Date.now() - 180_000, kind: 'network', severity: 'info', message: 'New listening port 56970/udp (Plex Media Serv)' },
  { id: 2, node_id: 'beelink', ts: Date.now() - 240_000, kind: 'service', severity: 'warning', message: 'Unit failed: jellyfin.service' },
];

vi.mock('../../../data/queries', () => ({
  useEvents: () => ({ data: EVENTS, isPending: false, isError: false }),
}));

const { EventsList } = await import('../EventsList');

describe('EventsList', () => {
  it('folds repeated occurrences into one row and opens them on demand', () => {
    render(
      <MemoryRouter>
        <EventsList nodeId="beelink" />
      </MemoryRouter>,
    );

    // One head row for the three Plex ports, one plain row for the failed unit.
    const heads = screen.getAllByRole('listitem').filter((item) => item.className === 'event-group');
    expect(heads).toHaveLength(1);
    expect(screen.getByText('×3')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Show 3 occurrences/ })).toBeTruthy();
    // Collapsed by default: the two older occurrences are not in the DOM.
    expect(screen.queryAllByRole('link', { name: /34206|56970/ })).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: /Show 3 occurrences/ }));
    expect(screen.getAllByRole('link', { name: /listening port/ })).toHaveLength(2);
    expect(screen.getByRole('button', { name: /Hide 3 occurrences/ })).toBeTruthy();

    // The unrelated event keeps its own row and detail link.
    expect(screen.getByRole('link', { name: 'Unit failed: jellyfin.service' })).toBeTruthy();
    expect(screen.getByText(/4 events · 2 rows/)).toBeTruthy();
  });
});
