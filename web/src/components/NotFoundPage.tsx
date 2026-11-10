import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Link } from '@astryxdesign/core/Link';
import { PageHead } from '../ui/kit';

export function NotFoundPage() {
  return (
    <>
      <PageHead title="Not found" />
      <EmptyState
        title="This route has no screen"
        description="The view was renamed or never existed."
        actions={<Link href="/">Back to systems</Link>}
      />
    </>
  );
}

/** An object route whose object is gone: say which, and link back. */
export function MissingThing({ what, back, backLabel }: { what: string; back: string; backLabel: string }) {
  return <EmptyState title={what} description="It was removed, renamed or never existed." actions={<Link href={back}>{backLabel}</Link>} />;
}

export function MissingNode({ nodeId }: { nodeId: string }) {
  return <MissingThing what={`No node has the id “${nodeId}”`} back="/" backLabel="Back to systems" />;
}
