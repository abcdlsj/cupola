import { Link, useParams } from 'react-router-dom';
import { PageHeader, Panel } from '../../components/Panel';
import { Table, TBody, Td, Th, THead } from '../../components/DataTable';
import { AgentMark } from '../../components/AgentMark';
import { CopyLinkButton } from '../../components/CopyLinkButton';
import { ErrorPanel, PageSkeleton } from '../../components/States';
import { useFleet } from '../../data/queries';
import { agentGroups, nodeById, sessionRuntimeSec } from '../../data/derive';
import { AGENT_TYPES } from '../../data/registry';
import type { Session } from '../../data/schema';
import { duration, percent, size } from '../../lib/format';

export function AgentsPage() {
  const fleet = useFleet();
  const { nodeId } = useParams();

  if (fleet.isPending) return <PageSkeleton title="Agents" />;
  if (fleet.isError || !fleet.data) {
    return (
      <>
        <PageHeader title="Agents" finding="The agent roster did not load." />
        <ErrorPanel what="Couldn't load the fleet snapshot." onRetry={() => void fleet.refetch()} />
      </>
    );
  }

  const snapshot = fleet.data;
  const now = snapshot.generatedAt;
  const scopeNode = nodeId ? nodeById(snapshot, nodeId) : undefined;
  const sessions = snapshot.sessions
    .filter((session) => (nodeId ? session.nodeId === nodeId : true))
    .slice()
    .sort((a, b) => sessionRuntimeSec(b, now) - sessionRuntimeSec(a, now));
  const groups = agentGroups(sessions, now);
  const nodeCount = new Set(sessions.map((session) => session.nodeId)).size;
  const leader = groups[0];
  const totalCpu = sessions.reduce((sum, session) => sum + session.cpuPct, 0);
  const totalRam = sessions.reduce((sum, session) => sum + session.rssMb, 0) / 1024;
  const longest = sessions.reduce((max, session) => Math.max(max, sessionRuntimeSec(session, now)), 0);
  const findingText =
    sessions.length === 0
      ? `No AI agent session is running${scopeNode ? ` on ${scopeNode.name}` : ''}.`
      : `${sessions.length} sessions across ${groups.length} tools on ${nodeCount} ${
          nodeCount === 1 ? 'box' : 'boxes'
        }; ${leader ? `${AGENT_TYPES[leader.type].label} holds ${leader.count}` : 'no leader'}.`;
  const showNode = !scopeNode;

  return (
    <>
      {scopeNode ? (
        <div className="scoped-head">
          <p className="page-finding">{findingText}</p>
          <CopyLinkButton />
        </div>
      ) : (
        <PageHeader
          title="Agents"
          finding={findingText}
          actions={<CopyLinkButton />}
        />
      )}

      <div className="kpi-row" data-count="4">
        <div className="kpi-cell">
          <div className="kpi-label">Sessions</div>
          <div className="kpi-value">{sessions.length}</div>
          <div className="kpi-sub">{groups.length} tools</div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-label">CPU</div>
          <div className="kpi-value">{percent(totalCpu, 1)}</div>
          <div className="kpi-sub">across all sessions</div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-label">Memory</div>
          <div className="kpi-value">{size(totalRam)}</div>
          <div className="kpi-sub">resident</div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-label">Longest session</div>
          <div className="kpi-value">{duration(longest)}</div>
          <div className="kpi-sub">still running</div>
        </div>
      </div>

      <Panel title="Roster" meta={`${sessions.length} sessions · ${groups.length} tools`} flush>
        {sessions.length === 0 ? (
          <p className="empty">
            Cupola matches process names and their working directory against a small registry of coding
            agents and model servers. Nothing matched in the last snapshot.
          </p>
        ) : (
          <Table label="AI agent sessions">
            <THead>
              <Th>Project</Th>
              {showNode ? <Th>Node</Th> : null}
              <Th num>PID</Th>
              <Th num>Runtime</Th>
              <Th num>CPU</Th>
              <Th num>Memory</Th>
              <Th>TTY</Th>
            </THead>
            <TBody>
              {groups.map((group) => {
                const info = AGENT_TYPES[group.type];
                return (
                  <GroupRows
                    key={group.type}
                    label={info.label}
                    category={info.category}
                    type={group.type}
                    count={group.count}
                    cpuPct={group.cpuPct}
                    rssMb={group.rssMb}
                    longestSec={group.longestSec}
                    sessions={group.sessions}
                    now={now}
                    showNode={showNode}
                  />
                );
              })}
            </TBody>
          </Table>
        )}
        <div className="panel-foot">
          <span className="note">
            Arguments are redacted. Cupola reads the process name, working directory and tty; it never
            reads prompts, files or environment variables.
          </span>
        </div>
      </Panel>
    </>
  );
}

function GroupRows({
  label,
  category,
  type,
  count,
  cpuPct,
  rssMb,
  longestSec,
  sessions,
  now,
  showNode,
}: {
  label: string;
  category: string;
  type: Session['type'];
  count: number;
  cpuPct: number;
  rssMb: number;
  longestSec: number;
  sessions: Session[];
  now: number;
  showNode: boolean;
}) {
  return (
    <>
      <tr className="roster-group-row">
        <td colSpan={showNode ? 7 : 6} data-cell="figures">
          <div className="roster-group">
            <AgentMark type={type} strong />
            <span className="roster-group-name">{label}</span>
            <span className="roster-group-cat">{category}</span>
            <span className="roster-group-figures">
              <span>
                <b>{count}</b> {count === 1 ? 'session' : 'sessions'}
              </span>
              <span>
                <b>{percent(cpuPct, 1)}</b> CPU
              </span>
              <span>
                <b>{size(rssMb / 1024)}</b> RAM
              </span>
              <span>
                longest <b>{duration(longestSec)}</b>
              </span>
            </span>
          </div>
        </td>
      </tr>
      {sessions.map((session) => (
        <tr key={session.id}>
          <Td cell="primary">
            <span className="row-name">{session.project}</span>
          </Td>
          {showNode ? (
            <Td cell="field" label="Node">
              <Link className="link" to={`/nodes/${session.nodeId}`}>
                {session.nodeId}
              </Link>
            </Td>
          ) : null}
          <Td num cell="field" label="PID">
            {session.pid}
          </Td>
          <Td num cell="field" label="Runtime">
            {duration(sessionRuntimeSec(session, now))}
          </Td>
          <Td num cell="key">
            {percent(session.cpuPct, 1)}
          </Td>
          <Td num cell="field" label="Memory">
            {size(session.rssMb / 1024)}
          </Td>
          <Td cell="field" label="TTY">
            {session.tty}
          </Td>
        </tr>
      ))}
    </>
  );
}
