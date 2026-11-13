/**
 * The controls: water.css styles the inputs, these wrap them with a label, a
 * hint and an error line, and keep the shared behaviour (segmented radios,
 * native dialogs, tabs as links) in one place.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

/* ----------------------------------------------------------------- fields -- */

const FIELD_SIZE: Record<string, string> = { sm: 'input-sm', md: '', lg: '' };

interface FieldShellProps {
  label: string;
  id: string;
  hint?: ReactNode;
  error?: string;
  hidden?: boolean;
  required?: boolean;
  optional?: boolean;
  children: ReactNode;
  className?: string;
  width?: number | string;
}

function FieldShell({ label, id, hint, error, hidden, required, optional, children, className, width }: FieldShellProps) {
  return (
    <div className={['field', className ?? ''].filter(Boolean).join(' ')} style={width ? { width } : undefined}>
      <label className="field-label" htmlFor={id} hidden={hidden}>
        {label}
        {required ? (
          <span className="req" aria-hidden="true">
            {' '}
            *
          </span>
        ) : optional ? (
          <span className="req"> (optional)</span>
        ) : null}
      </label>
      {children}
      {error ? (
        <span className="field-error" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="field-hint">{hint}</span>
      ) : null}
    </div>
  );
}

export function TextInput({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  description,
  status,
  isRequired,
  isOptional,
  isLabelHidden,
  isDisabled,
  hasClear,
  size = 'md',
  width,
  id,
  autoComplete,
  autoCapitalize,
  enterKeyHint,
  hasAutoFocus,
  hasSpellCheck,
  onEnter,
  'data-testid': testId,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'search' | 'password' | 'url' | 'email' | 'number';
  placeholder?: string;
  description?: ReactNode;
  status?: { type: 'error'; message?: string };
  isRequired?: boolean;
  isOptional?: boolean;
  isLabelHidden?: boolean;
  isDisabled?: boolean;
  hasClear?: boolean;
  size?: 'sm' | 'md' | 'lg';
  width?: number | string;
  id?: string;
  autoComplete?: string;
  autoCapitalize?: 'none' | 'off';
  enterKeyHint?: 'search' | 'go' | 'next' | 'done';
  hasAutoFocus?: boolean;
  hasAutoCorrect?: boolean;
  hasSpellCheck?: boolean;
  onEnter?: () => void;
  'data-testid'?: string;
}) {
  const auto = useId();
  const inputId = id ?? auto;
  const input = (
    <input
      id={inputId}
      className={['input', FIELD_SIZE[size], type === 'search' ? 'input-search' : ''].filter(Boolean).join(' ')}
      type={type}
      value={value}
      placeholder={placeholder}
      disabled={isDisabled}
      autoComplete={autoComplete}
      autoCapitalize={autoCapitalize}
      enterKeyHint={enterKeyHint}
      autoFocus={hasAutoFocus}
      spellCheck={hasSpellCheck ?? false}
      aria-invalid={status ? true : undefined}
      data-testid={testId}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && onEnter) {
          event.preventDefault();
          onEnter();
        }
      }}
    />
  );
  return (
    <FieldShell
      label={label}
      id={inputId}
      hint={description}
      error={status?.message}
      hidden={isLabelHidden}
      required={isRequired}
      optional={isOptional}
      width={width}
    >
      {isLabelHidden && hasClear ? (
        <span className="search">
          {input}
          {value ? (
            <button type="button" className="search-clear" aria-label="Clear" onClick={() => onChange('')}>
              ×
            </button>
          ) : null}
        </span>
      ) : (
        input
      )}
    </FieldShell>
  );
}

export function NumberInput({
  label,
  value,
  onChange,
  min,
  max,
  step,
  units,
  placeholder,
  isOptional,
  isRequired,
  isLabelHidden,
  isDisabled,
  status,
  description,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  units?: string;
  placeholder?: string;
  isOptional?: boolean;
  isRequired?: boolean;
  isLabelHidden?: boolean;
  isDisabled?: boolean;
  status?: { type: 'error'; message?: string };
  description?: ReactNode;
}) {
  const auto = useId();
  return (
    <FieldShell
      label={units ? `${label} (${units})` : label}
      id={auto}
      hint={description}
      error={status?.message}
      hidden={isLabelHidden}
      required={isRequired}
      optional={isOptional}
    >
      <input
        id={auto}
        className="input"
        type="number"
        value={value ?? ''}
        min={min}
        max={max}
        step={step ?? 1}
        placeholder={placeholder}
        disabled={isDisabled}
        aria-invalid={status ? true : undefined}
        onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))}
      />
    </FieldShell>
  );
}

export interface Option {
  value: string;
  label: string;
}

export function Select({
  label,
  value,
  options,
  onChange,
  isLabelHidden,
  isDisabled,
  width,
  description,
}: {
  label: string;
  value: string;
  options: Array<Option | string>;
  onChange: (value: string) => void;
  isLabelHidden?: boolean;
  isDisabled?: boolean;
  width?: number | string;
  description?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  variant?: string;
  presentation?: string;
}) {
  const list = options.map((option) => (typeof option === 'string' ? { value: option, label: option } : option));
  const current = list.find((option) => option.value === value) ?? list[0];
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(() => Math.max(0, list.findIndex((option) => option.value === value)));
  const root = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const commit = (index: number) => {
    const option = list[index];
    if (!option) return;
    onChange(option.value);
    setOpen(false);
    trigger.current?.focus();
  };

  return (
    <div className="field" style={width ? { width } : undefined}>
      <span className="field-label" hidden={isLabelHidden} id={`${label}-label`}>
        {label}
      </span>
      <span ref={root} style={{ position: 'relative', display: 'block' }}>
        <button
          ref={trigger}
          type="button"
          role="combobox"
          className="input select-trigger"
          aria-label={label}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={`${label}-listbox`}
          disabled={isDisabled}
          onClick={() => {
            setActive(Math.max(0, list.findIndex((option) => option.value === value)));
            setOpen((was) => !was);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              const step = event.key === 'ArrowDown' ? 1 : -1;
              setActive((index) => (index + step + list.length) % list.length);
              setOpen(true);
            } else if (event.key === 'Enter' || event.key === ' ') {
              if (!open) return;
              event.preventDefault();
              commit(active);
            } else if (event.key === 'Escape') {
              setOpen(false);
            }
          }}
        >
          <span className="select-value">{current?.label ?? value}</span>
          <span className="select-caret" aria-hidden="true" />
        </button>
        {open ? (
          <ul className="select-popup" role="listbox" id={`${label}-listbox`} aria-label={label}>
            {list.map((option, index) => (
              <li
                key={option.value}
                role="option"
                aria-selected={option.value === value}
                className={index === active ? 'is-active' : undefined}
                onMouseEnter={() => setActive(index)}
                onClick={() => commit(index)}
              >
                {option.label}
              </li>
            ))}
          </ul>
        ) : null}
      </span>
      {description ? <span className="field-hint">{description}</span> : null}
    </div>
  );
}

export function Checkbox({
  label,
  checked,
  onChange,
  isDisabled,
}: {
  label: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  isDisabled?: boolean;
}) {
  return (
    <label className="check">
      <input
        type="checkbox"
        checked={checked}
        disabled={isDisabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}

export function CheckboxGroup({
  label,
  options,
  value,
  onChange,
  isDisabled,
}: {
  label: string;
  options: Array<Option | string>;
  value: string[];
  onChange: (values: string[]) => void;
  isDisabled?: boolean;
}) {
  const list = options.map((option) => (typeof option === 'string' ? { value: option, label: option } : option));
  return (
    <fieldset className="check-group">
      <legend>{label}</legend>
      {list.map((option) => (
        <label className="check" key={option.value}>
          <input
            type="checkbox"
            checked={value.includes(option.value)}
            disabled={isDisabled}
            onChange={(event) =>
              onChange(
                event.target.checked ? [...value, option.value] : value.filter((entry) => entry !== option.value),
              )
            }
          />
          {option.label}
        </label>
      ))}
    </fieldset>
  );
}

export function Switch({
  label,
  checked,
  onChange,
}: {
  label: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="switch">
      <input type="checkbox" role="switch" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

/* --------------------------------------------------------------- segmented -- */

interface SegmentContext {
  value: string;
  onChange: (value: string) => void;
}

const SegmentCtx = createContext<SegmentContext | null>(null);

/**
 * A group of radios drawn as one bar: the roles and `aria-checked` are explicit
 * so the state is readable to assistive tech and to the tests.
 */
export function SegmentedControl({
  label,
  value,
  onChange,
  children,
  layout,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  layout?: 'fill';
}) {
  const group = useRef<HTMLDivElement>(null);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    const buttons = Array.from(group.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]') ?? []);
    const index = buttons.findIndex((button) => button.getAttribute('aria-checked') === 'true');
    if (index < 0) return;
    const next = buttons[(index + (event.key === 'ArrowRight' ? 1 : buttons.length - 1)) % buttons.length];
    event.preventDefault();
    next.focus();
    next.click();
  };
  return (
    <div
      ref={group}
      className={layout === 'fill' ? 'seg is-fill' : 'seg'}
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
    >
      <SegmentCtx.Provider value={{ value, onChange }}>{children}</SegmentCtx.Provider>
    </div>
  );
}

export function SegmentedControlItem({ value, label }: { value: string; label: ReactNode }) {
  const ctx = useContext(SegmentCtx);
  if (!ctx) return null;
  const selected = ctx.value === value;
  return (
    <button
      type="button"
      role="radio"
      className="seg-option"
      aria-checked={selected}
      tabIndex={selected ? 0 : -1}
      onClick={() => ctx.onChange(value)}
    >
      {label}
    </button>
  );
}

/* -------------------------------------------------------------------- tabs -- */

export function TabList({ children, label }: { children: ReactNode; label?: string; value?: string; onChange?: (v: string) => void; hasDivider?: boolean; size?: string }) {
  return (
    <nav className="tabs" aria-label={label}>
      {children}
    </nav>
  );
}

export function Tab({
  label,
  href,
  value,
  selected,
  endContent,
  ariaLabel,
}: {
  label: ReactNode;
  href?: string;
  value?: string;
  selected?: boolean;
  endContent?: ReactNode;
  ariaLabel?: string;
}) {
  return (
    <a className="tab" href={href} aria-current={selected ? 'page' : undefined} aria-label={ariaLabel}>
      {label}
      {value ? <span className="sr-only">{value}</span> : null}
      {endContent}
    </a>
  );
}

/* ------------------------------------------------------------------ dialog -- */

/**
 * A native <dialog>: the browser owns the focus trap, Escape and the backdrop,
 * we only own the frame. Widths are the two the app needs — a form and a result.
 */
export function Dialog({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 480,
  initialFocus,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  initialFocus?: React.RefObject<HTMLElement | null>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      if (initialFocus?.current) initialFocus.current.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, initialFocus]);

  const close = useCallback(() => onClose(), [onClose]);

  return (
    <dialog
      ref={ref}
      className="dialog"
      style={{ width: `min(${width}px, calc(100vw - 24px))` } as CSSProperties}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        // a click on the backdrop lands on the dialog element itself
        if (event.target === ref.current) close();
      }}
    >
      <div className="dialog-inner">
        <header className="dialog-head">
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span className="dialog-title" id={titleId}>
              {title}
            </span>
            {subtitle ? <span className="dialog-sub">{subtitle}</span> : null}
          </span>
          <button type="button" className="icon-btn" aria-label="Close" onClick={close}>
            ×
          </button>
        </header>
        <div className="dialog-body">{children}</div>
        {footer ? <footer className="dialog-foot">{footer}</footer> : null}
      </div>
    </dialog>
  );
}
