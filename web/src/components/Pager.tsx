import { CaretLeft, CaretRight } from '@phosphor-icons/react';

/** Up to seven page numbers, with a gap where the run is long. */
function pageList(current: number, pages: number): number[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const out: number[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(pages - 1, current + 1);
  if (start > 2) out.push(0);
  for (let i = start; i <= end; i++) out.push(i);
  if (end < pages - 1) out.push(0);
  out.push(pages);
  return out;
}

/**
 * The end of a table: the range on the left, page numbers on the right. Renders
 * nothing when everything already fits on one page.
 */
export function Pager({
  page,
  pages,
  from,
  to,
  total,
  onChange,
}: {
  page: number;
  pages: number;
  from: number;
  to: number;
  total: number;
  onChange: (page: number) => void;
}) {
  if (pages <= 1) return null;
  return (
    <div className="pager">
      <span className="pager-range">
        <b>
          {from}–{to}
        </b>{' '}
        of {total}
      </span>
      <span className="pager-pages">
        <button
          type="button"
          className="pager-pg pager-nav"
          onClick={() => onChange(page - 1)}
          disabled={page === 0}
          aria-label="Previous page"
        >
          <CaretLeft size={14} aria-hidden="true" />
        </button>
        {pageList(page + 1, pages).map((n, index) =>
          n === 0 ? (
            <span className="pager-gap" key={`gap-${index}`}>
              …
            </span>
          ) : (
            <button
              type="button"
              className="pager-pg"
              key={n}
              aria-current={n === page + 1 ? 'page' : undefined}
              onClick={() => onChange(n - 1)}
            >
              {n}
            </button>
          ),
        )}
        <button
          type="button"
          className="pager-pg pager-nav"
          onClick={() => onChange(page + 1)}
          disabled={page >= pages - 1}
          aria-label="Next page"
        >
          <CaretRight size={14} aria-hidden="true" />
        </button>
      </span>
    </div>
  );
}
