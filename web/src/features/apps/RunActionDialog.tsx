import { useEffect, useId, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ApiError, useRunAction } from '../../data/queries';
import type { Action, ActionResult } from '../../data/types';

/**
 * Tile → confirmation naming the node and the action → run on the agent →
 * result. Dangerous actions require the action name to be typed. One run per
 * action is enforced by the agent and the hub rate limit.
 */
export function RunActionDialog({
  action,
  nodeId,
  nodeName,
  open,
  onOpenChange,
}: {
  action: Action | null;
  nodeId: string;
  nodeName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [phase, setPhase] = useState<'confirm' | 'result'>('confirm');
  const [typed, setTyped] = useState('');
  const [result, setResult] = useState<ActionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fieldId = useId();
  const run = useRunAction();

  useEffect(() => {
    if (open) {
      setPhase('confirm');
      setTyped('');
      setResult(null);
      setError(null);
      run.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, action?.id]);

  if (!action) return null;
  const canRun = !action.danger || typed.trim() === action.name;

  const submit = async () => {
    if (!canRun) return;
    setError(null);
    try {
      const value = await run.mutateAsync({ nodeId, actionId: action.id });
      setResult(value);
      setPhase('result');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The hub did not return a result.');
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
            {action.allow_api ? 'token-callable' : 'UI only'}
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
              {error ? (
                <p className="form-error" role="alert">
                  {error}
                </p>
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
                  onClick={() => void submit()}
                  disabled={!canRun || run.isPending}
                  title={canRun ? undefined : 'Type the action name to enable Run'}
                >
                  {run.isPending ? 'Running…' : `Run ${action.name}`}
                </button>
              </div>
            </>
          ) : null}

          {phase === 'result' && result ? (
            <>
              <div className="dialog-body">
                <div className="result-status">
                  <span className="pill" data-tone={result.exit_code === 0 ? 'positive' : 'negative'}>
                    {result.exit_code === 0 ? 'Exited 0' : `Exited ${result.exit_code}`}
                  </span>
                  <span className="quiet">{(result.duration_ms / 1000).toFixed(1)} s</span>
                  {result.truncated ? <span className="quiet">output truncated to 8 KiB</span> : null}
                </div>
                <div className="result-grid">
                  <div className="result-cell">
                    <div className="result-label">Exit code</div>
                    <div className="result-value">{result.exit_code}</div>
                  </div>
                  <div className="result-cell">
                    <div className="result-label">Duration</div>
                    <div className="result-value">{(result.duration_ms / 1000).toFixed(1)} s</div>
                  </div>
                  <div className="result-cell">
                    <div className="result-label">Run</div>
                    <div className="result-value fig">{result.run_id.slice(0, 8)}</div>
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
