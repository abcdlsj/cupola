import { useEffect, useId, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { runAction } from '../../data/client';
import type { Action } from '../../data/schema';

type Phase = 'confirm' | 'running' | 'done' | 'error';

interface Result {
  exitCode: number;
  durationMs: number;
  stdout: string;
  stderr: string;
}

/**
 * Tile → confirmation naming the node and the action → run → result. Dangerous
 * actions require the action name to be typed. One run at a time per action.
 */
export function RunActionDialog({
  action,
  nodeName,
  open,
  onOpenChange,
}: {
  action: Action | null;
  nodeName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [phase, setPhase] = useState<Phase>('confirm');
  const [typed, setTyped] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const fieldId = useId();

  useEffect(() => {
    if (open) {
      setPhase('confirm');
      setTyped('');
      setResult(null);
    }
  }, [open, action?.id]);

  if (!action) return null;

  const canRun = !action.danger || typed.trim() === action.name;

  const run = async () => {
    if (!canRun) return;
    setPhase('running');
    try {
      const value = await runAction(action.id);
      setResult(value);
      setPhase('done');
    } catch {
      setPhase('error');
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay" />
        <Dialog.Content className="dialog" aria-describedby={`${fieldId}-desc`}>
          <Dialog.Title className="dialog-title">
            {phase === 'confirm' ? `Run ${action.name}?` : action.name}
          </Dialog.Title>
          <Dialog.Description className="dialog-desc" id={`${fieldId}-desc`}>
            {nodeName} · {action.type === 'wol' ? 'Wake-on-LAN' : 'Local script'} ·{' '}
            {action.allowApi ? 'token-callable' : 'UI only'}
          </Dialog.Description>

          {phase === 'confirm' ? (
            <>
              <p className="dialog-desc" style={{ marginTop: 12 }}>
                {action.description}
              </p>
              {action.danger ? (
                <div className="dialog-body">
                  <label className="field-label" htmlFor={fieldId}>
                    Type {action.name} to confirm this action
                  </label>
                  <input
                    id={fieldId}
                    className="input"
                    value={typed}
                    onChange={(event) => setTyped(event.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={action.name}
                  />
                </div>
              ) : null}
              <div className="dialog-foot">
                <Dialog.Close asChild>
                  <button type="button" className="btn btn-quiet">
                    Cancel
                  </button>
                </Dialog.Close>
                <button
                  type="button"
                  className={action.danger ? 'btn btn-danger' : 'btn btn-primary'}
                  onClick={() => void run()}
                  disabled={!canRun}
                  title={canRun ? undefined : 'Type the action name to enable Run'}
                >
                  Run {action.name}
                </button>
              </div>
            </>
          ) : null}

          {phase === 'running' ? (
            <div className="dialog-body" role="status">
              <p className="note">Running on {nodeName}. One run per action; timeout 60 s.</p>
              <div className="skeleton" style={{ width: 180, marginTop: 12 }} />
            </div>
          ) : null}

          {phase === 'error' ? (
            <>
              <div className="dialog-body">
                <p className="note">The action did not return a result. Nothing was changed.</p>
              </div>
              <div className="dialog-foot">
                <Dialog.Close asChild>
                  <button type="button" className="btn btn-ghost">
                    Close
                  </button>
                </Dialog.Close>
              </div>
            </>
          ) : null}

          {phase === 'done' && result ? (
            <>
              <div className="dialog-body">
                <div className="result-status">
                  <span className="pill" data-tone={result.exitCode === 0 ? 'positive' : 'negative'}>
                    {result.exitCode === 0 ? 'Exited 0' : `Exited ${result.exitCode}`}
                  </span>
                  <span className="quiet">{(result.durationMs / 1000).toFixed(1)} s</span>
                </div>
                <div className="result-grid">
                  <div className="result-cell">
                    <div className="result-label">Exit code</div>
                    <div className="result-value">{result.exitCode}</div>
                  </div>
                  <div className="result-cell">
                    <div className="result-label">Duration</div>
                    <div className="result-value">{(result.durationMs / 1000).toFixed(1)} s</div>
                  </div>
                  <div className="result-cell">
                    <div className="result-label">Output</div>
                    <div className="result-value">{(result.stdout.length + result.stderr.length) / 1024 < 1 ? '<1' : Math.round((result.stdout.length + result.stderr.length) / 1024)} KB</div>
                  </div>
                </div>
                {result.stdout ? <pre className="output">{result.stdout}</pre> : null}
                {result.stderr ? (
                  <pre className="output" data-tone="negative">
                    {result.stderr}
                  </pre>
                ) : null}
              </div>
              <div className="dialog-foot">
                <button type="button" className="btn btn-quiet" onClick={() => setPhase('confirm')}>
                  Run again
                </button>
                <Dialog.Close asChild>
                  <button type="button" className="btn btn-ghost">
                    Close
                  </button>
                </Dialog.Close>
              </div>
            </>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
