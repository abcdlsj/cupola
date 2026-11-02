import { Fig } from '../../components/Fig';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader, Panel } from '../../components/Panel';
import { Table, TBody, Td, Th, THead } from '../../components/DataTable';
import { AgentMark } from '../../components/AgentMark';
import { Empty, PageSkeleton } from '../../components/States';
import { useFleetAgents } from '../../data/queries';
import { agentTypeInfo } from '../../data/registry';
import { duration, percent, size } from '../../lib/format';

export function AgentsPage() {
  const query = useFleetAgents();
  const sessions = useMemo(() => query.data ?? [], [query.data]);
  const groups = useMemo(() => {
    const map = new Map<string, number>();
    for (const session of sessions) map.set(session.type, (map.get(session.type) ?? 0) + 1);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [sessions]);
  const totalCpu = sessions.reduce((sum, session) => sum + session.cpu_percent, 0);
  const totalRam = sessions.reduce((sum, session) => sum + session.rss_bytes, 0);
  const longest = sessions.reduce((max, session) => Math.max(max, session.runtime_sec), 0);
  const nodeCount = new Set(sessions.map((session) => session.node_id)).size;
  const leader = groups[0];

  if (query.isPending) return <PageSkeleton title="Agents" />;

  return (
    <>
      <PageHeader
        title="Agents"
        finding={
          sessions.length === 0
            ? 'No AI agent session is running on any node.'
            : `${sessions.length} sessions across ${groups.length} tools on ${nodeCount} ${nodeCount === 1 ? 'box' : 'boxes'}; ${
                leader ? `${agentTypeInfo(leader[0]).label} holds ${leader[1]}` : 'no leader'
              }.`
        }
      />
      <div className="kpi-row" data-count="4">
        <div className="kpi-cell">
          <div className="kpi-label">Sessions</div>
          <div className="kpi-value"><Fig>{sessions.length}</Fig></div>
          <div className="kpi-sub">{groups.length} tools</div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-label">CPU</div>
          <div className="kpi-value"><Fig>{percent(totalCpu, 1)}</Fig></div>
          <div className="kpi-sub">across all sessions</div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-label">Memory</div>
          <div className="kpi-value"><Fig>{size(totalRam)}</Fig></div>
          <div className="kpi-sub">resident</div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-label">Longest session</div>
          <div className="kpi-value"><Fig>{duration(longest)}</Fig></div>
          <div className="kpi-sub">still running</div>
        </div>
      </div>
      <Panel title="Roster" meta={`${sessions.length} sessions · ${groups.length} tools`} flush>
        {sessions.length === 0 ? (
          <Empty>Cupola matches process names and their working directory against a small registry of coding agents and model servers.</Empty>
        ) : (
          <Table label="AI agent sessions">
            <THead>
              <Th>Project</Th>
              <Th>Type</Th>
              <Th>Node</Th>
              <Th num>Runtime</Th>
              <Th num>CPU</Th>
              <Th num>Memory</Th>
              <Th>TTY</Th>
            </THead>
            <TBody>
              {sessions.map((session) => (
                <tr key={`${session.node_id}-${session.id}`}>
                  <Td cell="primary">
                    <Link className="row-name" to={`/nodes/${session.node_id}/agents/${session.id}`}>
                      {session.project || session.label}
                    </Link>
                  </Td>
                  <Td cell="field" label="Type">
                    <span className="agent-cell">
                      <AgentMark type={session.type} />
                      {session.label}
                    </span>
                  </Td>
                  <Td cell="field" label="Node">
                    <Link className="link" to={`/nodes/${session.node_id}/agents`}>
                      {session.node_name}
                    </Link>
                  </Td>
                  <Td num cell="field" label="Runtime">
                    {duration(session.runtime_sec)}
                  </Td>
                  <Td num cell="key">{percent(session.cpu_percent, 1)}</Td>
                  <Td num cell="field" label="Memory">
                    {size(session.rss_bytes)}
                  </Td>
                  <Td cell="field" label="TTY">
                    {session.tty || '—'}
                  </Td>
                </tr>
              ))}
            </TBody>
          </Table>
        )}
        <div className="panel-foot">
          <span className="note">
            Arguments are redacted. Cupola reads the process name, working directory and tty; it never reads prompts, files or environment variables.
          </span>
        </div>
      </Panel>
    </>
  );
}
