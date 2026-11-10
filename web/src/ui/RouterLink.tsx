import { forwardRef, type AnchorHTMLAttributes } from 'react';
import { Link } from 'react-router-dom';

/**
 * Astryx renders every link (Link, TopNavItem, Tab, ClickableCard, Breadcrumbs)
 * through this component, so in-app paths navigate with React Router and keep
 * back/forward, while external URLs stay plain anchors.
 */
export const RouterLink = forwardRef<HTMLAnchorElement, AnchorHTMLAttributes<HTMLAnchorElement> & { href?: string }>(
  function RouterLink({ href, ...rest }, ref) {
    if (href && href.startsWith('/') && !href.startsWith('//') && !rest.target && !rest.download) {
      return <Link ref={ref} to={href} {...rest} />;
    }
    return <a ref={ref} href={href} {...rest} />;
  },
);
