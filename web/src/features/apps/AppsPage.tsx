// taste-skill-ignore em-dash: the em dash is the missing-value mark.
import { useState } from 'react';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Divider } from '@astryxdesign/core/Divider';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { HStack } from '@astryxdesign/core/HStack';
import { Link } from '@astryxdesign/core/Link';
import { List, ListItem } from '@astryxdesign/core/List';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Table, pixel, proportional, type TableColumn } from '@astryxdesign/core/Table';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { ErrorPanel, LoadingPage } from '../../components/States';
import { RunActionDialog } from './RunActionDialog';
import { useFleetActions, useRuns } from '../../data/queries';
import type { Action, ActionRun, FleetAction } from '../../data/types';
import { clock, relative } from '../../lib/format';
import { actionMark } from '../../lib/actionIcon';
import { Band, PageHead, useIsPhone } from '../../ui/kit';

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
    return <img src={mark.src} alt="" width={size} height={size} style={{ borderRadius: 4, flex: 'none' }} />;
  }
  return (
    <Text type="inherit" color="secondary">
      <mark.Icon size={size} aria-hidden="true" style={{ display: 'block', flex: 'none' }} />
    </Text>
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
  const phone = useIsPhone();
  const now = Date.now();
  return (
    <VStack gap={0}>
      {actions.map((action, index) => {
        const fleet = 'node_id' in action;
        const node = fleet ? action.node_id : (nodeId ?? '');
        const name = fleet ? action.node_name : nodeName;
        const last = action.last_run_at ? relative(action.last_run_at, now) : null;
        return (
          <VStack key={`${node}-${action.id}`} gap={0} data-testid={`action-row-${node}-${action.id}`}>
            {index > 0 ? <Divider /> : null}
            <HStack gap={3} vAlign="center" hAlign="between" paddingBlock={3} wrap={phone ? 'wrap' : 'nowrap'}>
              <HStack gap={3} vAlign="center">
                <ActionMark action={action} />
                <VStack gap={0.5}>
                  <HStack gap={1.5} vAlign="center" wrap="wrap">
                    <Link href={actionHref(node, action.id)} maxLines={1}>
                      {action.name}
                    </Link>
                    {action.danger ? <Badge variant="error" label="Dangerous" /> : null}
                    {fleet && name ? (
                      <Link href={`/nodes/${encodeURIComponent(node)}/apps`} color="secondary">
                        {name}
                      </Link>
                    ) : null}
                  </HStack>
                  {action.description ? (
                    <Text type="supporting" maxLines={phone ? 2 : 1}>
                      {action.description}
                    </Text>
                  ) : null}
                </VStack>
              </HStack>
              <HStack gap={4} vAlign="center">
                <VStack width={phone ? undefined : 96}>
                  <LastRun action={action} />
                </VStack>
                <VStack width={phone ? undefined : 150}>
                  <Text type="supporting" textWrap="nowrap" justify={phone ? 'start' : 'end'}>
                    {last ? `${last} · ${actionKind(action)}` : actionKind(action)}
                  </Text>
                </VStack>
                <Button
                  label={action.type === 'wol' ? 'Wake' : 'Run'}
                  variant="secondary"
                  size={phone ? 'md' : 'sm'}
                  onClick={() => onRun(action)}
                />
              </HStack>
            </HStack>
          </VStack>
        );
      })}
    </VStack>
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
    return (
      <EmptyState
        title="No run recorded yet"
        description="A run appears here as soon as it finishes."
        isCompact
        headingLevel={3}
      />
    );
  }
  const who = (run: ActionRun) => [showNode ? run.node_id : null, run.actor, run.source].filter(Boolean).join(' · ');
  const title = (run: ActionRun) => run.action_name || run.action_id;

  if (phone) {
    return (
      <List hasDividers density="compact" edge="flush">
        {runs.map((run) => (
          <ListItem
            key={run.id}
            href={actionHref(run.node_id, run.action_id)}
            label={showAction ? title(run) : `${clock(run.ts)} · ${relative(run.ts, now)}`}
            description={
              showAction
                ? `${clock(run.ts)} · ${who(run)} · ${seconds(run.duration_ms)}`
                : `${who(run)} · ${seconds(run.duration_ms)}`
            }
            endContent={exited(run)}
          />
        ))}
      </List>
    );
  }

  const columns: TableColumn<RunRow>[] = [
    {
      key: 'started',
      header: 'Started',
      width: pixel(150),
      renderCell: ({ run }) => (
        <HStack gap={2} vAlign="center">
          <Text type="code" hasTabularNumbers textWrap="nowrap">
            {clock(run.ts)}
          </Text>
          <Text type="supporting" textWrap="nowrap">
            {relative(run.ts, now)}
          </Text>
        </HStack>
      ),
    },
  ];
  if (showAction) {
    columns.push({
      key: 'action',
      header: 'Action',
      width: proportional(2, { minWidth: 200 }),
      renderCell: ({ run }) => (
        <Link href={actionHref(run.node_id, run.action_id)} maxLines={1}>
          {title(run)}
        </Link>
      ),
    });
  }
  if (showNode) {
    columns.push({
      key: 'node',
      header: 'System',
      width: proportional(1, { minWidth: 120 }),
      renderCell: ({ run }) => (
        <Link href={`/nodes/${encodeURIComponent(run.node_id)}/apps`} maxLines={1}>
          {run.node_id}
        </Link>
      ),
    });
  }
  columns.push(
    {
      key: 'actor',
      header: 'Actor',
      width: proportional(1, { minWidth: 160 }),
      renderCell: ({ run }) => (
        <Text type="supporting" maxLines={1}>
          {run.actor} · {run.source}
        </Text>
      ),
    },
    {
      key: 'duration',
      header: 'Duration',
      width: pixel(110),
      align: 'end',
      renderCell: ({ run }) => (
        <Text type="code" hasTabularNumbers textWrap="nowrap">
          {seconds(run.duration_ms)}
        </Text>
      ),
    },
    {
      key: 'result',
      header: 'Result',
      width: pixel(120),
      align: 'end',
      renderCell: ({ run }) => exited(run),
    },
  );
  return (
    <Table
      data={runs.map((run) => ({ id: run.id, run }))}
      columns={columns}
      idKey="id"
      density="compact"
      dividers="rows"
      hasHover
    />
  );
}

/** The run limits every action shares; the hub enforces them, the agent too. */
export function RunLimits() {
  return (
    <Card>
      <VStack gap={1}>
        <Text type="label" color="secondary">
          Run limits
        </Text>
        <Text type="supporting">
          Actions run on the agent from its own config: a fixed script with no shell and no arguments, or a Wake-on-LAN
          packet. One run per action, 60 s timeout, output truncated to 8 KiB. The hub cannot create or edit them.
        </Text>
      </VStack>
    </Card>
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
      : `${all.length} ${all.length === 1 ? 'action' : 'actions'} on ${nodeCount} ${nodeCount === 1 ? 'system' : 'systems'} · ${recorded} runs recorded`;

  return (
    <>
      <PageHead title="Apps" desc={desc} />
      <Band title="Actions" desc="Defined in each agent's config; the hub only runs them" first>
        {all.length === 0 ? (
          <EmptyState
            title="No action is configured"
            description="Actions live in the agent config (0600) on each host; the hub cannot create them. A push-mode node reports samples only, so actions need a pull node."
            actions={<Link href="/settings/nodes">See the nodes</Link>}
            headingLevel={3}
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
