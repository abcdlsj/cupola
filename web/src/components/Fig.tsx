import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';

const NUMBER = /(-?\d[\d.,:]*)/;
const LEADING_FIGURE = /^\s*-?\d/;

/** Splits "245 GB of 512 GB" into mono figures and quiet UI-face unit words. */
function split(text: string, key: string): ReactNode[] {
  return text
    .split(NUMBER)
    .filter((part) => part !== '')
    .map((part, index) =>
      NUMBER.test(part) ? (
        <span className="n" key={`${key}-${index}`}>
          {part}
        </span>
      ) : (
        <span className="unit" key={`${key}-${index}`}>
          {part}
        </span>
      ),
    );
}

/**
 * A sibling list is a figure when it opens with a number, e.g. `{used} of {total}`
 * or `{hours} h at the poll interval`; then its word strings are units. A list
 * that opens with a word (a name, a path, a version) is left whole.
 */
function walkList(children: ReactNode, key: string): ReactNode[] {
  const list = Children.toArray(children);
  const first = list[0];
  const figure = typeof first === 'number' || (typeof first === 'string' && LEADING_FIGURE.test(first));
  return list.map((child, index) => {
    const childKey = `${key}.${index}`;
    if (typeof child === 'number') return split(String(child), childKey);
    if (typeof child === 'string') return figure ? split(child, childKey) : child;
    // only plain spans are walked, so links, pills and components keep their own text
    if (isValidElement(child) && child.type === 'span') {
      const element = child as ReactElement<{ children?: ReactNode }>;
      return cloneElement(element, undefined, ...walkList(element.props.children, childKey));
    }
    return child;
  });
}

export function Fig({ children }: { children: ReactNode }) {
  return <>{walkList(children, 'f')}</>;
}
