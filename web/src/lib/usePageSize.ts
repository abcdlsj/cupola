import { useEffect, useState } from 'react';

/** Rows per page follows the screen: 12, 10, 8, then 6 on a phone. */
function computePageSize(): number {
  if (typeof window === 'undefined') return 12;
  const width = window.innerWidth;
  if (width >= 1180) return 12;
  if (width >= 900) return 10;
  if (width >= 620) return 8;
  return 6;
}

export function usePageSize(): number {
  const [size, setSize] = useState(computePageSize);
  useEffect(() => {
    let frame = 0;
    const onResize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setSize(computePageSize()));
    };
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', onResize);
    };
  }, []);
  return size;
}

/** Clamp a page index after a filter or a page-size change. */
export function pageOf(total: number, size: number, page: number) {
  const pages = Math.max(1, Math.ceil(total / size));
  const index = Math.min(Math.max(0, page), pages - 1);
  const from = total ? index * size + 1 : 0;
  const to = Math.min((index + 1) * size, total);
  return { pages, index, from, to, rows: null as null };
}
