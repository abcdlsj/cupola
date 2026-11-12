/**
 * Cupola's page vocabulary. Pages compose these with the primitives and the
 * controls; nothing here sets a colour, only a token or a level.
 */
import { Children, useEffect, useState, type ReactNode } from 'react';
import { Badge, HStack, Heading, StatusDot, Text, VStack } from './primitives';

/** The shell, tables and tabs switch layouts at the same width. */
export const PHONE_QUERY = '(max-width: 899px)';

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  });
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const list = window.matchMedia(query);
    const onChange = () => setMatches(list.matches);
    onChange();
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

export function useIsPhone(): boolean {
  return useMediaQuery(PHONE_QUERY);
}

export type Tone = 'success' | 'warning' | 'error' | 'neutral' | 'accent';

/** Where a meter turns amber and red; a healthy meter is the accent, not green. */
export const METER_WARN = 75;
export const METER_CRIT = 90;

export function levelOf(value: number | null | undefined): 'accent' | 'warning' | 'error' | 'neutral' {
  if (value == null || !Number.isFinite(value)) return 'neutral';
  if (value >= METER_CRIT) return 'error';
  if (value >= METER_WARN) return 'warning';
  return 'accent';
}

/** A figure in mono with its unit stepped back in the UI face. Missing is a dash. */
export function Figure({
  value,
  digits = 1,
  unit,
  size,
}: {
  value: number | string | null | undefined;
  digits?: number;
  unit?: string;
  size?: 'code' | 'heading';
}) {
  const missing = value == null || (typeof value === 'number' && !Number.isFinite(value));
  const text = missing ? '—' : typeof value === 'number' ? value.toFixed(digits) : value;
  return (
    <span className={missing ? 'fig is-missing' : 'fig'} style={size === 'heading' ? { fontSize: 18 } : undefined}>
      {text}
      {unit && !missing ? <span className="unit">{unit}</span> : null}
    </span>
  );
}

/**
 * Every percentage in a table or list: a thin bar plus the figure. `neutral`
 * is for data that is not health (a process's share of the CPU).
 */
export function Meter({
  value,
  label,
  digits = 0,
  width = 96,
  showValue = true,
  tone,
  text,
}: {
  value: number | null | undefined;
  label: string;
  digits?: number;
  width?: number | string;
  showValue?: boolean;
  tone?: 'neutral';
  /** printed instead of the percentage */
  text?: string;
}) {
  const missing = value == null || !Number.isFinite(value);
  const clamped = missing ? 0 : Math.max(0, Math.min(100, value));
  const level = missing || tone === 'neutral' ? 'accent' : levelOf(value);
  return (
    <span className="meter">
      <span
        className={missing ? 'meter-track is-empty' : 'meter-track'}
        style={{ width }}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={missing ? undefined : Math.round(clamped)}
        aria-valuetext={missing ? 'no reading' : text ?? `${clamped.toFixed(digits)} percent`}
      >
        {missing ? null : <span className="meter-fill" data-level={level} style={{ width: `${clamped}%` }} />}
      </span>
      {showValue ? (
        <span className={missing ? 'meter-value is-missing' : 'meter-value'}>
          {missing ? '—' : (text ?? clamped.toFixed(digits))}
          {missing || text ? null : <span className="unit">%</span>}
        </span>
      ) : null}
    </span>
  );
}

/** A headline number in a KPI strip: label (with an optional dot), value, note. */
export function KpiCell({
  label,
  value,
  unit,
  state,
  note,
  digits = 0,
}: {
  label: string;
  value: string | number | null | undefined;
  unit?: string;
  state?: Tone;
  note?: ReactNode;
  digits?: number;
}) {
  const missing = value == null || (typeof value === 'number' && !Number.isFinite(value));
  const text = missing ? '—' : typeof value === 'number' ? value.toFixed(digits) : value;
  return (
    <div className="kpi-cell">
      <div className="kpi-label">
        <span>{label}</span>
        {state ? <StatusDot variant={state === 'accent' ? 'accent' : state} label={label} /> : null}
      </div>
      <div className={missing ? 'kpi-value is-missing' : 'kpi-value'}>
        <span>{text}</span>
        {unit && !missing ? <span className="unit">{unit}</span> : null}
      </div>
      {note ? <div className="kpi-note">{note}</div> : null}
    </div>
  );
}

/** Equal KPI cells in one card, hairlines between; a 2-column grid on a phone. */
export function KpiStrip({ children }: { children: ReactNode }) {
  return <div className="kpi-strip">{Children.toArray(children)}</div>;
}

/** A band of the page: rule, title, one line of context, controls, content. */
export function Band({
  title,
  desc,
  actions,
  children,
  first,
}: {
  title?: string;
  desc?: ReactNode;
  actions?: ReactNode;
  first?: boolean;
  children: ReactNode;
  gap?: number;
}) {
  return (
    <section className={first ? 'band is-first' : 'band'} aria-label={title}>
      {title || actions ? (
        <header className="band-head">
          <div className="band-heading">
            {title ? <h2>{title}</h2> : null}
            {desc ? <p className="band-desc">{desc}</p> : null}
          </div>
          {actions ? <div className="band-actions">{actions}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

/** The page's h1 with its context line, a leading crumb row and controls. */
export function PageHead({
  title,
  desc,
  actions,
  leading,
}: {
  title: ReactNode;
  desc?: ReactNode;
  actions?: ReactNode;
  leading?: ReactNode;
}) {
  return (
    <header className="page-head">
      <div className="page-head-main">
        {leading}
        <h1 className="page-title">{title}</h1>
        {desc ? <p className="page-desc">{desc}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}

/** A titled card: heading level 3, one supporting line, controls on the right. */
export function Section({
  title,
  desc,
  actions,
  children,
}: {
  title?: ReactNode;
  desc?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  padding?: number;
}) {
  return (
    <section className="panel">
      {title || actions ? (
        <header className="panel-head">
          <div className="panel-heading">
            {title ? <h3 className="panel-title">{title}</h3> : null}
            {desc ? <p className="panel-desc">{desc}</p> : null}
          </div>
          {actions ? <div className="panel-meta">{actions}</div> : null}
        </header>
      ) : null}
      <div className="panel-body" style={{ paddingTop: title ? 0 : 14 }}>
        {children}
      </div>
    </section>
  );
}

/** One finding, one line: what, where, how bad, how old, and a way in. */
export function FindingRow({
  state,
  what,
  where,
  value,
  label,
  ago,
  action,
}: {
  state: Tone;
  what: ReactNode;
  where?: ReactNode;
  value?: number | null;
  label?: string;
  ago?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <HStack gap={3} vAlign="center" hAlign="between" paddingBlock={2} wrap>
      <HStack gap={2} vAlign="center">
        <StatusDot variant={state === 'accent' ? 'accent' : state} label={typeof what === 'string' ? what : state} />
        <VStack gap={0}>
          <Text>{what}</Text>
          {where ? <Text type="supporting">{where}</Text> : null}
        </VStack>
      </HStack>
      <HStack gap={4} vAlign="center">
        {value !== undefined ? <Meter value={value} label={label ?? (typeof what === 'string' ? what : 'value')} /> : null}
        {ago ? <Text type="supporting">{ago}</Text> : null}
        {action}
      </HStack>
    </HStack>
  );
}

/** A label/value list, values in mono; a missing value is a dash. */
export function Facts({ rows }: { rows: Array<{ label: string; value: ReactNode }> }) {
  return (
    <dl className="facts">
      {rows.map((row) => (
        <div className="fact" key={row.label}>
          <dt>{row.label}</dt>
          <dd>
            {row.value == null || row.value === '' ? (
              <span className="code is-missing">—</span>
            ) : typeof row.value === 'string' || typeof row.value === 'number' ? (
              <span className="code">{row.value}</span>
            ) : (
              row.value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** A small label and a mono figure on one line. */
export function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <HStack gap={1.5} vAlign="center">
      <Text type="supporting">{label}</Text>
      {typeof children === 'string' || typeof children === 'number' ? (
        <Text type="code" textWrap="nowrap">
          {children}
        </Text>
      ) : (
        children
      )}
    </HStack>
  );
}

export { Badge, Heading };
