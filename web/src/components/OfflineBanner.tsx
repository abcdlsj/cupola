import { clock, relative } from '../lib/format';
import { useOnline } from '../lib/hooks';

/** One quiet notice: the snapshot on screen is the last one this device saw. */
export function OfflineBanner({ lastUpdated, now }: { lastUpdated: number; now: number }) {
  const online = useOnline();
  if (online) return null;
  return (
    <div className="offline" role="status">
      <span className="dot-mark" data-severity="warning" aria-hidden="true" />
      <span>
        Offline. Showing the snapshot from {clock(lastUpdated)} UTC, {relative(lastUpdated, now)}.
      </span>
    </div>
  );
}
