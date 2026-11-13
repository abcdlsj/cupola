/**
 * Cupola's own primitives. water.css styles the elements; these components only
 * choose which element, which class and which spacing token. No component sets
 * a colour, and none reaches outside the token sheet.
 */
import {
  Children,
  type AnchorHTMLAttributes,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { Link as RouterLink } from 'react-router-dom';

/* ------------------------------------------------------------------ stacks */

type HAlign = 'start' | 'center' | 'end' | 'between';
type VAlign = 'start' | 'center' | 'end' | 'stretch' | 'baseline';

const space = (n?: number): string | undefined => (n == null ? undefined : `${n * 4}px`);
const justify: Record<HAlign, string> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  between: 'space-between',
};
const align: Record<VAlign, string> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  stretch: 'stretch',
  baseline: 'baseline',
};

interface LayoutProps {
  gap?: number;
  wrap?: boolean;
  width?: number | string;
  maxWidth?: number | string;
  minHeight?: number | string;
  height?: number | string;
  padding?: number;
  paddingBlock?: number;
  paddingInline?: number;
  paddingBlockStart?: number;
  paddingInlineStart?: number;
}

type StackProps = LayoutProps & Omit<HTMLAttributes<HTMLDivElement>, 'color'>;

function layoutStyle(props: LayoutProps): CSSProperties {
  return {
    gap: space(props.gap),
    padding: space(props.padding),
    paddingBlock: space(props.paddingBlock),
    paddingInline: space(props.paddingInline),
    paddingBlockStart: space(props.paddingBlockStart),
    paddingInlineStart: space(props.paddingInlineStart),
    maxWidth: props.maxWidth,
    minHeight: props.minHeight,
    height: props.height,
    width: props.width,
  };
}

function splitLayout<T extends StackProps>(props: T) {
  const {
    gap,
    wrap,
    width,
    maxWidth,
    minHeight,
    height,
    padding,
    paddingBlock,
    paddingInline,
    paddingBlockStart,
    paddingInlineStart,
    ...dom
  } = props;
  return {
    dom,
    layout: { gap, wrap, width, maxWidth, minHeight, height, padding, paddingBlock, paddingInline, paddingBlockStart, paddingInlineStart },
  };
}

export function HStack({
  gap = 2,
  hAlign = 'start',
  vAlign = 'center',
  className,
  style,
  children,
  ...rest
}: StackProps & { hAlign?: HAlign; vAlign?: VAlign }) {
  const { dom, layout } = splitLayout({ ...rest, gap });
  return (
    <div
      {...dom}
      className={className}
      style={{
        ...layoutStyle(layout),
        display: 'flex',
        flexDirection: 'row',
        justifyContent: justify[hAlign],
        alignItems: align[vAlign],
        flexWrap: layout.wrap ? 'wrap' : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function VStack({
  gap = 2,
  hAlign = 'stretch',
  vAlign = 'start',
  className,
  style,
  children,
  ...rest
}: StackProps & { hAlign?: HAlign | 'stretch'; vAlign?: VAlign | 'between' }) {
  const { dom, layout } = splitLayout({ ...rest, gap });
  return (
    <div
      {...dom}
      className={className}
      style={{
        ...layoutStyle(layout),
        display: 'flex',
        flexDirection: 'column',
        alignItems: hAlign === 'stretch' ? 'stretch' : justify[hAlign as HAlign],
        justifyContent: vAlign === 'between' ? 'space-between' : align[vAlign as VAlign],
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------- grid */

export interface GridColumns {
  minWidth: number;
  max?: number;
  repeat?: 'fit' | 'fill';
}

export function Grid({
  columns,
  gap = 4,
  columnGap,
  children,
  className,
  style,
  ...rest
}: StackProps & { columns: number | GridColumns; columnGap?: number }) {
  const { dom, layout } = splitLayout({ ...rest, gap });
  const gapPx = gap * 4;
  const template =
    typeof columns === 'number'
      ? `repeat(${columns}, minmax(0, 1fr))`
      : `repeat(auto-${columns.repeat ?? 'fit'}, minmax(${
          columns.max ? `max(${columns.minWidth}px, calc((100% - ${gapPx * (columns.max - 1)}px) / ${columns.max}))` : `${columns.minWidth}px`
        }, 1fr))`;
  return (
    <div
      {...dom}
      className={['grid', className ?? ''].filter(Boolean).join(' ')}
      style={{
        ...layoutStyle(layout),
        // the gap shorthand is expanded by the browser, so never set it and a
        // sub-property together: a later `undefined` sub-property would clear
        // the other axis.
        gap: undefined,
        rowGap: space(gap),
        columnGap: space(columnGap ?? gap),
        display: 'grid',
        gridTemplateColumns: template,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Divider() {
  return <hr />;
}

/* -------------------------------------------------------------------- text */

type TextType = 'body' | 'code' | 'supporting' | 'label' | 'inherit';
type TextSize = '2xs' | 'xsm' | 'sm' | 'md' | 'lg' | '2xl';

const SIZE_CLASS: Record<TextSize, string> = {
  '2xs': 't-2xs',
  xsm: 't-xsm',
  sm: 't-sm',
  md: '',
  lg: 't-lg',
  '2xl': 't-2xl',
};

export function Text({
  type = 'body',
  size,
  color,
  weight,
  maxLines,
  textWrap,
  justify,
  wordBreak,
  className,
  children,
  title,
}: {
  type?: TextType;
  size?: TextSize;
  color?: 'primary' | 'secondary' | 'accent';
  weight?: 'regular' | 'medium' | 'semibold';
  maxLines?: number;
  textWrap?: 'nowrap';
  justify?: 'start' | 'end' | 'center';
  wordBreak?: 'break-all';
  className?: string;
  children?: ReactNode;
  title?: string;
}) {
  const classes = [
    type === 'code' ? 'code' : '',
    type === 'supporting' ? 'muted small' : '',
    type === 'label' ? 'muted small w-medium' : '',
    color === 'secondary' ? 'muted' : '',
    color === 'accent' ? 'accent' : '',
    size ? SIZE_CLASS[size] : '',
    weight ? `w-${weight}` : '',
    maxLines ? `clamp-${Math.min(maxLines, 2)}` : '',
    textWrap === 'nowrap' ? 'nowrap' : '',
    justify === 'end' ? 'justify-end' : '',
    wordBreak === 'break-all' ? 'break-all' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <span className={classes} title={title}>
      {children}
    </span>
  );
}

export function Heading({
  level,
  children,
  className,
  id,
}: {
  level: 1 | 2 | 3 | 4;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  const Tag = `h${level}` as 'h1' | 'h2' | 'h3' | 'h4';
  return (
    <Tag className={className} id={id}>
      {children}
    </Tag>
  );
}

/* ------------------------------------------------------------------- links */

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'color'> & {
  href: string;
  type?: 'code';
  color?: 'primary' | 'secondary' | 'accent';
  maxLines?: number;
  tooltip?: string;
  children?: ReactNode;
};

function isInternal(href: string): boolean {
  return href.startsWith('/') && !href.startsWith('//');
}

/** An in-app path navigates with React Router; anything else is a plain anchor. */
export function Link({ href, type, color, maxLines, tooltip, className, children, ...rest }: LinkProps) {
  const classes = [
    type === 'code' ? 'code' : '',
    color === 'secondary' ? 'muted' : '',
    color === 'accent' ? 'accent' : '',
    maxLines ? `clamp-${Math.min(maxLines, 2)}` : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  const props = { ...rest, className: classes || undefined, title: tooltip ?? rest.title };
  if (isInternal(href) && !rest.target && !rest.download) {
    return (
      <RouterLink to={href} {...props}>
        {children}
      </RouterLink>
    );
  }
  return (
    <a href={href} {...props}>
      {children}
    </a>
  );
}

/* -------------------------------------------------------------------- card */

export function Card({
  children,
  padding,
  className,
  style,
}: {
  children: ReactNode;
  padding?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={['panel', className ?? ''].filter(Boolean).join(' ')} style={{ padding: space(padding), ...style }}>
      {children}
    </div>
  );
}

export function Badge({
  label,
  variant = 'neutral',
  children,
}: {
  label?: ReactNode;
  variant?: 'neutral' | 'success' | 'warning' | 'error' | 'red' | 'accent';
  children?: ReactNode;
}) {
  const tone = variant === 'red' ? 'error' : variant;
  return (
    <span className="pill" data-tone={tone}>
      {children ?? label}
    </span>
  );
}

const DOT_TONE: Record<string, string> = {
  success: 'success',
  warning: 'warning',
  error: 'error',
  neutral: 'neutral',
  accent: 'accent',
};

/** A state dot; the label is for assistive tech and the tip. */
export function StatusDot({
  variant = 'neutral',
  label,
  tooltip,
  isPulsing = false,
}: {
  variant?: 'success' | 'warning' | 'error' | 'neutral' | 'accent';
  label: string;
  tooltip?: string;
  isPulsing?: boolean;
}) {
  return (
    <span
      className={isPulsing ? 'dot is-pulsing' : 'dot'}
      data-tone={DOT_TONE[variant]}
      role="img"
      aria-label={label}
      title={tooltip ?? label}
    />
  );
}

/* ------------------------------------------------------------------ tables */

export type CellAlign = 'start' | 'end';

export interface TableColumn<T> {
  key: string;
  header?: ReactNode;
  width?: string;
  align?: CellAlign;
  renderCell?: (row: T) => ReactNode;
}

export const pixel = (width: number): string => `${width}px`;
export const proportional = (share = 1, options?: { minWidth?: number }): string | undefined =>
  options?.minWidth ? `minmax(${options.minWidth}px, ${share}fr)` : `${share}fr`;

export function Table<T extends Record<string, unknown>>({
  data,
  columns,
  idKey,
  label,
  hasHover = false,
}: {
  data: T[];
  columns: Array<TableColumn<T>>;
  idKey: string | ((row: T) => string | number);
  label?: string;
  density?: 'compact' | 'regular';
  dividers?: 'rows' | 'none';
  hasHover?: boolean;
}) {
  const keyOf = (row: T, index: number): string =>
    typeof idKey === 'function' ? String(idKey(row)) : String(row[idKey] ?? index);
  return (
    <div className="table-wrap">
      <table className="table" aria-label={label}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={column.align === 'end' ? 'num' : undefined}
                style={column.width ? { width: column.width } : undefined}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, index) => (
            <tr key={keyOf(row, index)} className={hasHover ? 'is-hover' : undefined}>
              {columns.map((column) => (
                <td key={column.key} className={column.align === 'end' ? 'num' : undefined}>
                  {column.renderCell ? column.renderCell(row) : String(row[column.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------- lists */

export function List({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <ul className="rows" aria-label={label} style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {children}
    </ul>
  );
}

export function ListItem({
  href,
  label,
  description,
  startContent,
  endContent,
}: {
  href?: string;
  label: ReactNode;
  description?: ReactNode;
  startContent?: ReactNode;
  endContent?: ReactNode;
}) {
  const body = (
    <>
      <span className="row-main">
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {startContent}
          <span>{label}</span>
        </span>
        {description ? <span className="muted small">{description}</span> : null}
      </span>
      {endContent ? <span style={{ flex: 'none' }}>{endContent}</span> : null}
    </>
  );
  return (
    <li className="row">
      {href ? (
        <Link href={href} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, width: '100%' }}>
          {body}
        </Link>
      ) : (
        body
      )}
    </li>
  );
}

/* ------------------------------------------------------------- empty, code */

export function EmptyState({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  isCompact?: boolean;
  headingLevel?: 1 | 2 | 3 | 4;
}) {
  return (
    <div className="empty">
      <span className="empty-title">{title}</span>
      {description ? <span className="empty-desc">{description}</span> : null}
      {actions ? <div className="empty-actions">{actions}</div> : null}
    </div>
  );
}

export function Banner({
  status = 'info',
  title,
  description,
  endContent,
}: {
  status?: 'info' | 'success' | 'warning' | 'error';
  title: ReactNode;
  description?: ReactNode;
  endContent?: ReactNode;
  collapsible?: boolean;
}) {
  return (
    <div className="banner" data-tone={status === 'info' ? undefined : status} role={status === 'error' ? 'alert' : 'status'}>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span className="banner-title">{title}</span>
        {description ? <span className="banner-desc">{description}</span> : null}
      </span>
      {endContent}
    </div>
  );
}

export function CodeBlock({ code, title, maxHeight }: { code: string; title?: string; maxHeight?: number; width?: string; isWrapped?: boolean; hasCopyButton?: boolean; language?: string; size?: string }) {
  return (
    <pre className="code-block" style={maxHeight ? { maxHeight } : undefined}>
      {title ? <span className="code-title">{title}</span> : null}
      <code>{code}</code>
    </pre>
  );
}

export function Skeleton({ height = 10, width = '100%', radius = 3 }: { height?: number; width?: number | string; radius?: number; index?: number }) {
  return <span className="skeleton" style={{ width, height, borderRadius: radius }} aria-hidden="true" />;
}

/** Rows a page can map over with hairlines between, as one list. */
export function Rows({ children }: { children: ReactNode }) {
  return (
    <div className="rows">
      {Children.toArray(children).map((child, index) => (
        <div key={index}>{child}</div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- buttons */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'destructive';

export function Button({
  label,
  children,
  variant = 'secondary',
  size = 'md',
  href,
  onClick,
  type = 'button',
  isDisabled,
  disabled,
  isLoading,
  width,
  tooltip,
  className,
  form,
  'aria-expanded': ariaExpanded,
  'aria-pressed': ariaPressed,
  'data-testid': testId,
}: {
  label?: ReactNode;
  children?: ReactNode;
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  href?: string;
  onClick?: () => void;
  type?: 'button' | 'submit' | 'reset';
  isDisabled?: boolean;
  disabled?: boolean;
  isLoading?: boolean;
  width?: number | string;
  tooltip?: string;
  className?: string;
  form?: string;
  'aria-expanded'?: boolean;
  'aria-pressed'?: boolean;
  'aria-label'?: string;
  'data-testid'?: string;
}) {
  const classes = [
    'btn',
    variant === 'primary' ? 'btn-primary' : '',
    variant === 'danger' || variant === 'destructive' ? 'btn-danger' : '',
    variant === 'ghost' ? 'btn-ghost' : '',
    size === 'sm' ? 'btn-sm' : '',
    size === 'lg' ? 'btn-lg' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  const off = isDisabled || disabled || isLoading;
  const style = { ...(width ? { width } : {}) };
  const text = children ?? label;
  if (href && !off) {
    return (
      <Link href={href} className={classes} style={style} title={tooltip}>
        {text}
      </Link>
    );
  }
  return (
    <button
      type={type}
      className={classes}
      style={style}
      title={tooltip}
      disabled={off}
      onClick={onClick}
      form={form}
      aria-expanded={ariaExpanded}
      aria-pressed={ariaPressed}
      aria-busy={isLoading || undefined}
      data-testid={testId}
    >
      {text}
    </button>
  );
}
