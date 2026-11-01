import { useCopyLink } from '../lib/hooks';

/** Copy the current route, query string included; the label confirms in place. */
export function CopyLinkButton() {
  const { copied, copy } = useCopyLink();
  return (
    <button type="button" className="copy-btn" onClick={copy}>
      {copied ? 'Link copied' : 'Copy link'}
    </button>
  );
}
