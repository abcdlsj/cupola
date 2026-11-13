// taste-skill-ignore em-dash: the em dash is the missing-value mark.
import { useState } from 'react';
import { ErrorPanel, LoadingPage } from '../../components/States';
import { RunActionDialog } from './RunActionDialog';
import { useFleetActions, useRuns } from '../../data/queries';
import type { Action, ActionRun, FleetAction } from '../../data/types';
import { clock, relative } from '../../lib/format';
import { actionMark } from '../../lib/actionIcon';
import { Band, PageHead, useIsPhone } from '../../ui/kit';
import {
  Badge,
  Button,
  EmptyState,
  HStack,
  Link,
  List,
  ListItem,
  StatusDot,
  Table,
  Text,
  VStack,
  type TableColumn,
} from '../../ui/primitives';

export function actionKind(action: Pick<Action, 'type'>): string {
  return action.type === 'wol' ? 'Wake-on-LAN' : 'Script';
}

export function actionHref(nodeId: string, actionId: string): string {
  return `/nodes/${encodeURIComponent(nodeId)}/apps/${encodeURIComponent(actionId)}`;
}

/** The operator's raster, or a monochrome symbol in the text colour. */
export function ActionMark({ action, size = 20 }: { action: Action; size?: number }) {
  const mark = actionMark(action);
  if (mark.kind === 'image') {
    return (
      <span className="mark">
        <img src={mark.src} alt="" width={size} height={size} style={{ borderRadius: 4, flex: 'none' }} />
      </span>
    );
  }
  return (
    <span className="mark">
      <mark.Icon size={size} aria-hidden="true" style={{ display: 'block' }} />
    </span>
  );
}

/** The last result as a dot and its word. */
export function LastRun({ action }: { action: Action }) {
  const word = action.last_ok == null ? 'Never run' : action.last_ok ? 'OK' : 'Failed';
  const variant = action.last_ok == null ? 'neutral' : action.last_ok ? 'success' : 'error';
  return (
    <HStack gap={1.5} vAlign="center">
      <StatusDot variant={variant} label={word} />
      <Text type="supporting" textWrap="nowrap">
        {word}
      </Text>
    </HStack>
  );
}

/**
 * One action, one row: mark, name (a link to its route), description, last
 * result and a visible Run button that opens the confirmation.
 */
export function ActionRows({
  actions,
  nodeId,
  nodeName,
  onRun,
}: {
  actions: Array<Action | FleetAction>;
  /** the node of a per-node list; fleet rows carry their own */
  nodeId?: string;
  nodeName?: string;
  onRun: (action: Action | FleetAction) => void;
}) {
  const now = Date.now();
  return (
    <div>
      {actions.map((action) => {
        const fleet = 'node_id' in action;
        const node = fleet ? action.node_id : (nodeId ?? '');
        const name = fleet ? action.node_name : nodeName;
        const last = action.last_run_at ? relative(action.last_run_at, now) : null;
        return (
          <div className="action-row" key={`${node}-${action.id}`} data-testid={`action-row-${node}-${action.id}`}>
            <div className="action-main">
              <ActionMark action={action} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <span className="action-title">
                  <Link href={actionHref(node, action.id)} maxLines={1}>
                    {action.name}
                  </Link>
                  {action.danger ? <Badge variant="error" label="Dangerous" /> : null}
                  {fleet && name ? (
                    <Link href={`/nodes/${encodeURIComponent(node)}/apps`} color="secondary">
                      {name}
                    </Link>
                  ) : null}
                </span>
                {action.description ? (
                  <span className="action-desc clamp-2" title={action.description}>
                    {action.description}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="action-side">
              <LastRun action={action} />
              <span className="action-when">{last ? `${last} · ${actionKind(action)}` : actionKind(action)}</span>
              <Button
                label={action.type === 'wol' ? 'Wake' : 'Run'}
                onClick={() => onRun(action)}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface RunRow extends Record<string, unknown> {
  id: string;
  run: ActionRun;
}

function exited(run: Pick<ActionRun, 'ok' | 'exit_code'>) {
  return <Badge variant={run.ok ? 'success' : 'error'} label={run.ok ? 'Exited 0' : `Exited ${run.exit_code}`} />;
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}

/**
 * Action runs, newest first. Each run names its action as a link to the
 * action's route; `showNode` adds the system for the fleet list.
 */
export function RunsTable({
  runs,
  showNode = false,
  showAction = true,
}: {
  runs: ActionRun[];
  showNode?: boolean;
  showAction?: boolean;
}) {
  const phone = useIsPhone();
  const now = Date.now();
  if (runs.length === 0) {
    return <EmptyState title="No run recorded yet" description="A run appears here as soon as it finishes." />;
  }
  const who = (run: ActionRun) => [showNode ? run.node_id : null, run.actor, run.source].filter(Boolean).join(' · ');
  const title = (run: ActionRun) => run.action_name || run.action_id;

  if (phone) {
    return (
      <List label="Runs">
        {runs.map((run) => (
          <ListItem
            key={run.id}
            href={actionHref(run.node_id, run.action_id)}
            label={showAction ? title(run) : `${clock(run.ts)} · ${relative(run.ts, now)}`}
            description={
              showAction ? `${clock(run.ts)} · ${who(run)} · ${seconds(run.duration_ms)}` : `${who(run)} · ${seconds(run.duration_ms)}`
            }
            endContent={exited(run)}
          />
        ))}
      </List>
    );
  }

  const columns: Array<TableColumn<RunRow>> = [
    {
      key: 'started',
      header: 'Started',
      width: '150px',
      renderCell: ({ run: entry }) => (
        <HStack gap={2} vAlign="center">
          <span className="code nowrap">{clock(entry.ts)}</span>
          <span className="muted small nowrap">{relative(entry.ts, now)}</span>
        </HStack>
      ),
    },
  ];
  if (showAction) {
    columns.push({
      key: 'action',
      header: 'Action',
      width: '100%',
      renderCell: ({ run: entry }) => (
        <Link href={actionHref(entry.node_id, entry.action_id)} maxLines={1}>
          {title(entry)}
        </Link>
      ),
    });
  }
  if (showNode) {
    columns.push({
      key: 'node',
      header: 'System',
      renderCell: ({ run: entry }) => (
        <Link href={`/nodes/${encodeURIComponent(entry.node_id)}/apps`} maxLines={1}>
          {entry.node_id}
        </Link>
      ),
    });
  }
  columns.push(
    {
      key: 'actor',
      header: 'Actor',
      width: '180px',
      renderCell: ({ run: entry }) => (
        <Text type="supporting" maxLines={1}>
          {entry.actor} · {entry.source}
        </Text>
      ),
    },
    {
      key: 'duration',
      header: 'Duration',
      width: '110px',
      align: 'end',
      renderCell: ({ run: entry }) => <span className="code nowrap">{seconds(entry.duration_ms)}</span>,
    },
    {
      key: 'result',
      header: 'Result',
      width: '120px',
      align: 'end',
      renderCell: ({ run: entry }) => exited(entry),
    },
  );
  return <Table data={runs.map((run) => ({ id: run.id, run }))} columns={columns} idKey="id" label="Runs" hasHover />;
}

/** The run limits every action shares; the hub enforces them, the agent too. */
export function RunLimits() {
  return (
    <section className="section">
      <VStack gap={1}>
        <Text type="label">Run limits</Text>
        <Text type="supporting">
          Actions run on the agent from its own config: a fixed script with no shell and no arguments, or a Wake-on-LAN
          packet. One run per action, 60 s timeout, output truncated to 8 KiB. The hub cannot create or edit them.
        </Text>
      </VStack>
    </section>
  );
}

export function AppsPage() {
  const actions = useFleetActions();
  const runs = useRuns();
  const [selected, setSelected] = useState<FleetAction | null>(null);
  const [open, setOpen] = useState(false);

  if (actions.isPending) return <LoadingPage title="Apps" />;
  if (actions.isError) {
    return (
      <>
        <PageHead title="Apps" />
        <ErrorPanel what="Could not load actions." onRetry={() => void actions.refetch()} />
      </>
    );
  }

  const all = actions.data ?? [];
  const failed = all.filter((action) => action.last_ok === false);
  const nodeCount = new Set(all.map((action) => action.node_id)).size;
  const recorded = runs.data?.length ?? 0;
  const desc =
    failed.length > 0
      ? `${failed.length} of ${all.length} actions failed recently: ${failed
          .map((action) => `${action.name} (${action.node_name})`)
          .join('; ')}`
      : `on ${nodeCount} ${nodeCount === 1 ? 'system' : 'systems'} · ${recorded} runs recorded`;

  return (
    <>
      <PageHead title={`${all.length} ${all.length === 1 ? 'action' : 'actions'}`} desc={desc} />
      <Band title="Actions" desc="Defined in each agent's config; the hub only runs them" first>
        {all.length === 0 ? (
          <EmptyState
            title="No action is configured"
            description="Actions live in the agent config (0600) on each host; the hub cannot create them. A push-mode node reports samples only, so actions need a pull node."
            actions={<Link href="/settings/nodes">See the nodes</Link>}
          />
        ) : (
          <ActionRows
            actions={all}
            onRun={(action) => {
              setSelected(action as FleetAction);
              setOpen(true);
            }}
          />
        )}
      </Band>
      <Band title="Recent runs" desc={`Every run is an event; the newest twelve here · ${recorded} recorded`}>
        {runs.isError ? (
          <ErrorPanel what="Could not load runs." onRetry={() => void runs.refetch()} />
        ) : (
          <RunsTable runs={(runs.data ?? []).slice(0, 12)} showNode />
        )}
      </Band>
      <RunLimits />
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
