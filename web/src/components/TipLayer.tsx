import { useEffect, useState } from 'react';

interface Shown {
  text: string;
  x: number;
  y: number;
  /** true when the tip sits above the anchor instead of under it */
  above: boolean;
}

/**
 * One tooltip for the whole app, shown only when the string is actually cut
 * off. A `title` attribute would do the same job, but the browser draws it
 * below the pointer at an OS-chosen delay and shows it even when nothing is
 * hidden; this waits for a real overflow, sits above the anchor, and follows
 * the theme.
 *
 * Nodes declare their full value with `title` or `data-tip`. The layer adopts
 * every `title` it finds and removes the attribute, so the native tip never
 * doubles up with this one.
 */
export function TipLayer() {
  const [shown, setShown] = useState<Shown | null>(null);

  useEffect(() => {
    const adopt = (root: ParentNode) => {
      for (const el of root.querySelectorAll('[title]')) {
        const value = el.getAttribute('title');
        if (value) {
          el.setAttribute('data-tip', value);
          el.removeAttribute('title');
        }
      }
    };

    adopt(document);
    const observer = new MutationObserver(() => adopt(document));
    observer.observe(document.body, { childList: true, subtree: true });

    let current: HTMLElement | null = null;

    const hide = () => {
      current = null;
      setShown(null);
    };

    const isCut = (el: HTMLElement): boolean => {
      const style = getComputedStyle(el);
      if (style.overflow === 'visible' && style.textOverflow !== 'ellipsis') {
        // a clamped block still reports overflow through its scroll height
        if (!style.webkitLineClamp || style.webkitLineClamp === 'none') return false;
      }
      return el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;
    };

    const show = (el: HTMLElement) => {
      const text = el.getAttribute('data-tip');
      if (!text || !isCut(el)) {
        hide();
        return;
      }
      current = el;
      const rect = el.getBoundingClientRect();
      // a wide element centres its tip on the pointer's side, not the page
      const above = rect.top > 56;
      const width = Math.min(320, window.innerWidth - 24);
      const x = Math.min(
        Math.max(rect.left + rect.width / 2, width / 2 + 12),
        window.innerWidth - width / 2 - 12,
      );
      setShown({ text, x, y: above ? rect.top - 8 : rect.bottom + 8, above });
    };

    const onOver = (event: Event) => {
      const target = event.target as HTMLElement | null;
      const el = target?.closest?.('[data-tip]') as HTMLElement | null;
      if (!el) {
        if (current) hide();
        return;
      }
      if (el === current) return;
      show(el);
    };

    const onFocus = (event: FocusEvent) => {
      const el = (event.target as HTMLElement | null)?.closest?.('[data-tip]') as HTMLElement | null;
      if (el) show(el);
      else if (current) hide();
    };

    document.addEventListener('mouseover', onOver);
    document.addEventListener('mouseout', (event) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest?.('[data-tip]')) hide();
    });
    document.addEventListener('focusin', onFocus);
    document.addEventListener('focusout', hide);
    // a scrolled anchor would leave the tip behind
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);

    return () => {
      observer.disconnect();
      document.removeEventListener('mouseover', onOver);
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('focusout', hide);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, []);

  if (!shown) return null;
  return (
    <div
      className="tip"
      role="tooltip"
      style={{
        left: shown.x,
        top: shown.y,
        transform: shown.above ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
      }}
    >
      {shown.text}
    </div>
  );
}
