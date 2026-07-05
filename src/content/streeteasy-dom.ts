// All StreetEasy-specific DOM selectors and URL shapes live in this file
// (and streeteasy-jsonld.ts). When StreetEasy's markup drifts, these two
// files plus test/fixtures/search-results.html are the entire blast radius.

const LISTING_HREF_PATTERN = /^\/(building|rental)\//;

export interface DiscoveredCard {
  element: Element;
  /** Normalized with normalizeListingUrl: origin + pathname, no query/hash. */
  listingUrl: string;
}

/**
 * Finds every listing card under `root` and, for cards with a resolvable
 * listing anchor, its normalized url. `root` is a ParentNode rather than a
 * Document so a future MutationObserver can pass in just the added subtree.
 *
 * A card with no anchor pointing at a listing (`/building/...` or
 * `/rental/...`) is silently omitted — never throws on malformed cards.
 */
export function discoverCards(root: ParentNode): DiscoveredCard[] {
  const cards: DiscoveredCard[] = [];
  for (const element of root.querySelectorAll('[data-testid="listing-card"]')) {
    const anchors = element.querySelectorAll('a[href]');
    for (const anchor of anchors) {
      const href = anchor.getAttribute('href');
      if (!href) continue;

      let resolved: URL;
      try {
        resolved = new URL(href, 'https://streeteasy.com');
      } catch {
        continue;
      }
      if (!LISTING_HREF_PATTERN.test(resolved.pathname)) continue;

      const listingUrl = normalizeListingUrl(href);
      if (!listingUrl) continue;

      cards.push({ element, listingUrl });
      break;
    }
  }
  return cards;
}

/**
 * Parses `href` (relative hrefs resolve against https://streeteasy.com) and
 * returns `origin + pathname` — lowercased host, no query string, no hash,
 * no trailing slash. Returns null for unparseable input or any host other
 * than streeteasy.com.
 */
export function normalizeListingUrl(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href, 'https://streeteasy.com');
  } catch {
    return null;
  }

  if (url.hostname.toLowerCase() !== 'streeteasy.com') return null;

  let pathname = url.pathname;
  if (pathname.length > 1 && pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1);
  }

  return `${url.protocol}//${url.hostname.toLowerCase()}${pathname}`;
}
