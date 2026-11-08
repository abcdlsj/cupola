import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Panel } from '../../components/Panel';
import { Empty } from '../../components/States';
import { AppsSkeleton } from '../../components/Skeletons';
import { RunActionDialog } from './RunActionDialog';
import { useFleetActions, useRuns } from '../../data/queries';
import type { ActionRun, FleetAction } from '../../data/types';
import { clock, relative } from '../../lib/format';
import { actionMark } from '../../lib/actionIcon';

export function AppsPage() {
  const actions = useFleetActions();
  const runs = useRuns();
  const [selected, setSelected] = useState<FleetAction | null>(null);
  const [open, setOpen] = useState(false);
  const now = Date.now();
  const all = actions.data ?? [];
  const failed = all.filter((action) => action.last_ok === false);
  const nodeCount = new Set(all.map((action) => action.node_id)).size;

  if (actions.isPending) return <AppsSkeleton />;

  return (
    <>
      <Panel
        title="Apps"
        level={1}
        desc={
          failed.length > 0
            ? `${failed.length} of ${all.length} actions failed recently: ${failed
                .map((action) => `${action.name} (${action.node_name})`)
                .join('; ')}.`
            : `${all.length} ${all.length === 1 ? 'action' : 'actions'} on ${nodeCount} ${nodeCount === 1 ? 'box' : 'boxes'}; ${runs.data?.length ?? 0} runs recorded.`
        }
        flush
      >
      <div className="app-list">
        {all.map((action) => {
          const mark = actionMark(action);
          const kind = action.type === 'wol' ? 'Wake-on-LAN' : 'Script';
          const last = action.last_run_at ? relative(action.last_run_at, now) : 'never run';
          return (
            <button
              type="button"
              className="app-row"
              key={`${action.node_id}-${action.id}`}
              onClick={() => {
                setSelected(action);
                setOpen(true);
              }}
            >
              <span className="app-mark" aria-hidden="true" data-danger={action.danger ? 'true' : undefined}>
                {mark.kind === 'image' ? <img src={mark.src} alt="" /> : <mark.Icon size={17} />}
              </span>
              <span className="app-main">
                <span className="app-name-line">
                  <span className="app-name" title={action.name}>
                    {action.name}
                  </span>
                  {action.danger ? (
                    <span className="pill" data-tone="negative">
                      Dangerous
                    </span>
                  ) : null}
                </span>
                <span className="app-desc" title={action.description}>
                  {action.description}
                </span>
              </span>
              <span className="app-state">
                {action.last_ok == null ? (
                  <span className="pill" data-tone="neutral">
                    Never run
                  </span>
                ) : (
                  <span className="pill" data-tone={action.last_ok ? 'positive' : 'negative'}>
                    {action.last_ok ? 'OK' : 'Failed'}
                  </span>
                )}
              </span>
              <span className="app-meta" title={`${action.node_name} · ${last} · ${kind}`}>
                {action.node_name} · {last} · {kind}
              </span>
            </button>
          );
        })}
      </div>
      {all.length === 0 ? (
        <Empty>
          No action is configured. Actions live in the agent config (0600) on each host; the hub cannot create them.
          A push-mode node reports samples only, so actions need a pull node.{' '}
          <Link className="link" to="/settings/nodes">See the nodes</Link>.
        </Empty>
      ) : null}
      </Panel>
      <Panel title="Recent runs" desc="Every run is an event; the newest twelve here." meta={`${runs.data?.length ?? 0} recorded`} flush>
        {!runs.data || runs.data.length === 0 ? (
          <Empty>No run recorded yet.</Empty>
        ) : (
          <ul className="run-list">
            {runs.data.slice(0, 12).map((run: ActionRun) => (
              <li className="run-row" key={run.id}>
                <span className="fig">{clock(run.ts)}</span>
                <span>
                  <Link className="link" to={`/nodes/${run.node_id}/apps/${run.action_id}`}>
                    {run.action_name || run.action_id}
                  </Link>
                  <span className="cell-sub">{run.node_id} · {run.actor} · {run.source}</span>
                </span>
                <span className="quiet">{(run.duration_ms / 1000).toFixed(1)} s</span>
                <span className="pill" data-tone={run.ok ? 'positive' : 'negative'}>
                  {run.ok ? 'Exited 0' : `Exited ${run.exit_code}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <p className="note">
        Actions run on the agent from its own config: a fixed script with no shell and no arguments, or a Wake-on-LAN packet. One run per action, 60 s
        timeout, output truncated to 8 KiB. The hub cannot create or edit them.
      </p>
      <RunActionDialog
        action={selected}
        nodeId={selected?.node_id ?? ''}
        nodeName={selected?.node_name ?? ''}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
