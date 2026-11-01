import { PageHeader, Panel } from '../../components/Panel';
import { CopyLinkButton } from '../../components/CopyLinkButton';
import { CupolaMark } from '../../components/CupolaMark';

const FACTS: Array<{ label: string; value: string }> = [
  { label: 'Version', value: '0.1.0-m0' },
  { label: 'Milestone', value: 'M0 · design gate' },
  { label: 'Data', value: 'Fixture snapshot, no hub yet' },
  { label: 'Direction', value: 'Data terminal, seed 956138436' },
  { label: 'Type', value: 'Public Sans · IBM Plex Mono' },
  { label: 'Fonts', value: 'Self-hosted WOFF2, OFL 1.1' },
];

export function AboutPage() {
  return (
    <>
      <PageHeader
        title="About"
        finding="Cupola is self-hosted monitoring for the Linux boxes you run: one agent per host, one hub, one PWA."
        actions={<CopyLinkButton />}
      />
      <div className="row">
        <div className="span-6">
          <Panel title="This build">
            <dl className="kv">
              {FACTS.map((fact) => (
                <div className="kv-row" key={fact.label}>
                  <dt>{fact.label}</dt>
                  <dd>{fact.value}</dd>
                </div>
              ))}
            </dl>
          </Panel>
        </div>
        <div className="span-6">
          <Panel title="What M0 is">
            <div className="about-body">
              <span className="about-mark" aria-hidden="true">
                <CupolaMark size={28} />
              </span>
              <p>
                The shell, the design tokens and four screens built from fake data. No agent, no hub, no
                database. The numbers are invented and stable, so the screenshots can be compared between
                runs.
              </p>
              <p className="note">
                Next milestones: the agent collector (M1), the hub and SQLite history (M2), the remaining
                screens (M3), alerts and hardware detail (M4), relay and deployment (M5).
              </p>
            </div>
          </Panel>
        </div>
      </div>
      <p className="note">
        Hosts, addresses and figures on these screens are fixtures. Nothing here is collected from a real
        machine.
      </p>
    </>
  );
}
