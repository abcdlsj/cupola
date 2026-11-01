import { useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  ArrowsClockwise,
  Database,
  DownloadSimple,
  HardDrive,
  Power,
  ShieldCheck,
  Terminal,
  WifiHigh,
} from '@phosphor-icons/react';
import { PageHeader, Panel } from '../../components/Panel';
import { Table, TBody, Td, Th, THead } from '../../components/DataTable';
import { CopyLinkButton } from '../../components/CopyLinkButton';
import { RunPill } from '../../components/StatusPill';
import { ErrorPanel, PageSkeleton } from '../../components/States';
import { RunActionDialog } from './RunActionDialog';
import { useFleet } from '../../data/queries';
import { nodeById } from '../../data/derive';
import type { Action } from '../../data/schema';
import { clock, relative } from '../../lib/format';

const ICONS = {
  wake: Power,
  backup: Database,
  restart: ArrowsClockwise,
  update: DownloadSimple,
  terminal: Terminal,
  shield: ShieldCheck,
  disk: HardDrive,
  network: WifiHigh,
};

export function AppsPage() {
  const fleet = useFleet();
  const { nodeId } = useParams();
  const [selected, setSelected] = useState<Action | null>(null);
  const [open, setOpen] = useState(false);

  if (fleet.isPending) return <PageSkeleton title="Apps" />;
  if (fleet.isError || !fleet.data) {
    return (
      <>
        <PageHeader title="Apps" finding="The action list did not load." />
        <ErrorPanel what="Couldn't load the fleet snapshot." onRetry={() => void fleet.refetch()} />
      </>
    );
  }

  const snapshot = fleet.data;
  const now = snapshot.generatedAt;
  const scopeNode = nodeId ? nodeById(snapshot, nodeId) : undefined;
  const actions = snapshot.actions.filter((action) => (nodeId ? action.nodeId === nodeId : true));
  const failed = actions.filter(
    (action) => action.lastRun && !action.lastRun.ok && now - action.lastRun.at <= 24 * 60 * 60 * 1000,
  );
  const lastRun = actions
    .filter((action) => action.lastRun)
    .sort((a, b) => (b.lastRun?.at ?? 0) - (a.lastRun?.at ?? 0))[0];
  const nodeCount = new Set(actions.map((action) => action.nodeId)).size;
  const runs = [...actions]
    .filter((action) => action.lastRun)
    .sort((a, b) => (b.lastRun?.at ?? 0) - (a.lastRun?.at ?? 0));

  const finding =
    failed.length > 0
      ? `${failed.length} of ${actions.length} actions failed in the last 24 h: ${failed
          .map((action) => `${action.name} exited ${action.lastRun?.exitCode} at ${clock(action.lastRun?.at ?? now)} UTC`)
          .join('; ')}.`
      : `${actions.length} actions on ${nodeCount} ${nodeCount === 1 ? 'box' : 'boxes'}; ${lastRun ? `${lastRun.name} finished ${relative(lastRun.lastRun?.at ?? now, now)}` : 'nothing has run yet'}.`;

  const openRun = (action: Action) => {
    setSelected(action);
    setOpen(true);
  };

  const nodeName = selected ? nodeById(snapshot, selected.nodeId)?.name ?? selected.nodeId : '';

  return (
    <>
      {scopeNode ? (
        <div className="scoped-head">
          <p className="page-finding">{finding}</p>
          <CopyLinkButton />
        </div>
      ) : (
        <PageHeader title="Apps" finding={finding} actions={<CopyLinkButton />} />
      )}

      <div className="app-grid" data-columns={actions.length % 3 === 0 ? '3' : '2'}>
        {actions.map((action) => {
          const Icon = ICONS[action.icon];
          const node = nodeById(snapshot, action.nodeId);
          return (
            <button type="button" className="app-tile" key={action.id} onClick={() => openRun(action)}>
              <span className="app-tile-top">
                <Icon size={18} className="app-tile-icon" aria-hidden="true" />
                <span className="app-tile-name">{action.name}</span>
                <span className="app-tile-pill">
                  {action.lastRun ? (
                    <RunPill ok={action.lastRun.ok} />
                  ) : (
                    <span className="pill" data-tone="neutral">
                      Never run
                    </span>
                  )}
                </span>
              </span>
              <span className="app-tile-desc">{action.description}</span>
              <span className="app-tile-foot">
                <span className="app-tile-where">
                  {node?.name ?? action.nodeId} ·{' '}
                  {action.lastRun ? relative(action.lastRun.at, now) : 'never run'}
                </span>
                <span className="app-tile-status">
                  {action.danger ? 'Type to confirm' : action.type === 'wol' ? 'Wake-on-LAN' : 'Script'}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {actions.length === 0 ? (
        <div className="panel">
          <p className="empty">
            No action is configured{scopeNode ? ` on ${scopeNode.name}` : ''}. Actions are defined in the
            agent config on each host.
          </p>
        </div>
      ) : null}

      <Panel title="Recent runs" meta={`${runs.length} recorded`} flush>
        <Table label="Recent action runs">
          <THead>
            <Th>Action</Th>
            <Th>Node</Th>
            <Th num>Started</Th>
            <Th num>Duration</Th>
            <Th>Actor</Th>
            <Th>Result</Th>
          </THead>
          <TBody>
            {runs.map((action) => (
              <tr key={`run-${action.id}`}>
                <Td cell="primary">
                  <button type="button" className="row-link" onClick={() => openRun(action)}>
                    {action.name}
                  </button>
                </Td>
                <Td cell="field" label="Node">
                  {nodeById(snapshot, action.nodeId)?.name ?? action.nodeId}
                </Td>
                <Td num cell="field" label="Started">
                  {relative(action.lastRun?.at ?? now, now)}
                </Td>
                <Td num cell="field" label="Duration">
                  {((action.lastRun?.durationMs ?? 0) / 1000).toFixed(1)} s
                </Td>
                <Td cell="field" label="Actor">
                  {action.lastRun?.actor ?? '—'}
                </Td>
                <Td cell="key">
                  {action.lastRun ? (
                    <RunPill ok={action.lastRun.ok} />
                  ) : (
                    <span className="pill" data-tone="neutral">
                      Never run
                    </span>
                  )}
                </Td>
              </tr>
            ))}
          </TBody>
        </Table>
        <div className="panel-foot">
          <span className="note">
            Actions run on the agent from its own config: a fixed script with no shell and no arguments,
            or a Wake-on-LAN packet. One run per action, 60 s timeout, output truncated to 8 KiB. The hub
            cannot create or edit them.
          </span>
        </div>
      </Panel>

      <RunActionDialog action={selected} nodeName={nodeName} open={open} onOpenChange={setOpen} />
    </>
  );
}
