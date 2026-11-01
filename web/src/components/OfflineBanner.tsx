import { clock, relative } from '../lib/format';
import { useOnline } from '../lib/hooks';

/** One quiet notice: the snapshot on screen is the last one this device saw. */
export function OfflineBanner({ lastUpdated, stale }: { lastUpdated: number; stale: boolean }) {
  const online = useOnline();
  if (online && !stale) return null;
  return (
    <div className="offline" role="status">
      <span className="dot-mark" data-severity="warning" aria-hidden="true" />
      <span>
        {online ? 'The hub stopped answering.' : 'Offline.'} Showing the snapshot from {clock(lastUpdated)} UTC,{' '}
        {relative(lastUpdated, Date.now())}.
      </span>
    </div>
  );
}
