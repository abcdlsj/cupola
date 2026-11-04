import { describe, expect, it } from 'vitest';
import { EVENT_GROUP_WINDOW_MS, eventGroupKey, groupEvents, messageShape } from '../events';
import type { Event } from '../../data/types';

function event(overrides: Partial<Event> & { id: number; ts: number }): Event {
  return {
    node_id: 'beelink',
    kind: 'network',
    severity: 'info',
    message: 'New listening port 58466/udp (Plex Media Serv)',
    ...overrides,
  } as Event;
}

describe('messageShape', () => {
  it('drops the port number but keeps the process', () => {
    expect(messageShape('New listening port 58466/udp (Plex Media Serv)')).toBe(
      'New listening port #/udp (Plex Media Serv)',
    );
    expect(messageShape('New listening port 56970/udp (Plex Media Serv)')).toBe(
      messageShape('New listening port 34206/udp (Plex Media Serv)'),
    );
    expect(messageShape('New listening port 8080/tcp (nginx)')).not.toBe(
      messageShape('New listening port 8081/tcp (docker)'),
    );
  });

  it('folds counters and other figures', () => {
    expect(messageShape('Container plex restarted (3 total)')).toBe('Container plex restarted (# total)');
    expect(messageShape('Disk / (root) 92% full')).toBe('Disk / (root) #% full');
  });
});

describe('groupEvents', () => {
  it('folds repeats of one process on one node, newest first', () => {
    const events = [
      event({ id: 4, ts: 4000, message: 'New listening port 44087/udp (Plex Media Serv)' }),
      event({ id: 3, ts: 3000, message: 'New listening port 34206/udp (Plex Media Serv)' }),
      event({ id: 2, ts: 2000, message: 'New listening port 59580/udp (Plex Media Serv)' }),
      event({ id: 1, ts: 1000, message: 'Unit failed: jellyfin.service', kind: 'service', severity: 'warning' }),
    ];
    const groups = groupEvents(events);
    expect(groups).toHaveLength(2);
    expect(groups[0].count).toBe(3);
    expect(groups[0].latest.id).toBe(4);
    expect(groups[0].events.map((entry) => entry.id)).toEqual([4, 3, 2]);
    expect(groups[1].count).toBe(1);
  });

  it('keeps nodes, kinds and severities apart', () => {
    const events = [
      event({ id: 1, ts: 3000 }),
      event({ id: 2, ts: 2000, node_id: 'studio' }),
      event({ id: 3, ts: 1000, severity: 'warning' }),
    ];
    expect(groupEvents(events)).toHaveLength(3);
  });

  it('starts a new group once the window has passed', () => {
    const events = [
      event({ id: 2, ts: 10 * 60 * 1000 }),
      event({ id: 1, ts: 0 }),
    ];
    expect(groupEvents(events)).toHaveLength(1);
    const apart = [
      event({ id: 2, ts: EVENT_GROUP_WINDOW_MS + 5000 }),
      event({ id: 1, ts: 0 }),
    ];
    const groups = groupEvents(apart);
    expect(groups).toHaveLength(2);
    expect(groups[0].count).toBe(1);
    expect(groups[1].count).toBe(1);
  });

  it('groups a repeated message only within a node', () => {
    expect(eventGroupKey(event({ id: 1, ts: 1 }))).toContain('beelink');
    expect(eventGroupKey(event({ id: 1, ts: 1, node_id: 'atlas' }))).toContain('atlas');
  });
});
