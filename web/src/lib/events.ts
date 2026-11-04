import type { Event } from '../data/types';

/**
 * How far apart two occurrences of the same shape may be and still fold into one
 * row. An hour keeps a bursting service together without welding this morning's
 * event to tonight's.
 */
export const EVENT_GROUP_WINDOW_MS = 60 * 60 * 1000;

/**
 * The message without the figures that make one occurrence unique:
 * "New listening port 58466/udp (Plex Media Serv)" and
 * "New listening port 56970/udp (Plex Media Serv)" share one row, while a
 * different process keeps its own.
 */
export function messageShape(message: string): string {
  return message
    .replace(/\b\d+\/(tcp|udp)\b/gi, '#/$1')
    .replace(/\b\d+\b/g, '#')
    .replace(/\s+/g, ' ')
    .trim();
}

export function eventGroupKey(event: Event): string {
  return [event.node_id, event.kind, event.severity, messageShape(event.message)].join('|');
}

export interface EventGroup {
  /** node, kind, severity and the message shape: stable across occurrences. */
  key: string;
  /** Newest first, the order the API returns. */
  events: Event[];
  /** The newest occurrence; its message, time and link represent the group. */
  latest: Event;
  count: number;
}

/**
 * Folds events that repeat on one node with the same kind, severity and message
 * shape into a single row, keeping the newest occurrence as the representative.
 * The list is expected newest first; an occurrence older than the window starts a
 * fresh group so a long-running process keeps one row per hour, not one forever.
 */
export function groupEvents(events: Event[], windowMs = EVENT_GROUP_WINDOW_MS): EventGroup[] {
  const groups: EventGroup[] = [];
  const open = new Map<string, EventGroup>();
  for (const event of events) {
    const key = eventGroupKey(event);
    const group = open.get(key);
    if (group && group.latest.ts - event.ts <= windowMs) {
      group.events.push(event);
      group.count += 1;
      continue;
    }
    const created: EventGroup = { key, events: [event], latest: event, count: 1 };
    open.set(key, created);
    groups.push(created);
  }
  return groups;
}
