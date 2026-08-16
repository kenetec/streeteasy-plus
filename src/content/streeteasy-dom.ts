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
    const anchor = findListingAnchor(element);
    if (!anchor) continue;

    const href = anchor.getAttribute('href');
    if (!href) continue;
    const listingUrl = normalizeListingUrl(href);
    if (!listingUrl) continue;

    cards.push({ element, listingUrl });
  }
  return cards;
}

/**
 * The first anchor within `card` whose href points at a listing
 * (`/building/...` or `/rental/...`), or null if the card has none. Used
 * both by `discoverCards` (to derive the card's listingUrl) and by
 * decorate.ts (to place the badge right after the address link).
 *
 * Confirmed on real cards: there are always TWO listing-pattern anchors —
 * the address link and an image-carousel link wrapping the photo — and
 * their DOM order isn't a contract worth relying on. With
 * `preferText: true` (used by findListingAddress below, which needs actual
 * address text) this skips any matching anchor whose trimmed textContent
 * is empty rather than returning the first match regardless of text.
 * Default behavior (badge placement, discoverCards) is unchanged.
 */
export function findListingAnchor(
  card: Element,
  options?: { preferText?: boolean }
): HTMLAnchorElement | null {
  const preferText = options?.preferText ?? false;
  for (const anchor of card.querySelectorAll('a[href]')) {
    const href = anchor.getAttribute('href');
    if (!href) continue;

    let resolved: URL;
    try {
      resolved = new URL(href, 'https://streeteasy.com');
    } catch {
      continue;
    }
    if (!LISTING_HREF_PATTERN.test(resolved.pathname)) continue;

    if (preferText && !anchor.textContent?.trim()) continue;

    return anchor as HTMLAnchorElement;
  }
  return null;
}

export interface CardAddress {
  /** Geocodable one-line address, e.g. "1134 Fulton Street, Bedford-Stuyvesant, New York, NY". */
  query: string;
}

// Strips a trailing unit suffix ("#7L", "#3-B", ...) from a street address.
// Requires a preceding space so it can't clip a hyphenated Queens house
// number like "27-03 42nd Road" (no "#" anywhere in that string, so this
// never matches it).
const UNIT_SUFFIX_PATTERN = /\s+#.*$/;

/**
 * Finds the neighborhood name for `anchor`'s card, e.g. "Bedford-
 * Stuyvesant" from a nearby line reading "Rental unit in Bedford-
 * Stuyvesant". Located by text shape (a sibling of the address anchor
 * whose text contains " in <something>"), not by StreetEasy's minified
 * CSS-module class names, which change on every deploy. Returns undefined
 * — never throws — if no sibling matches; the NYC bounding-rect geocode
 * filter still bounds the result even without a neighborhood.
 */
function findNeighborhood(anchor: Element): string | undefined {
  const parent = anchor.parentElement;
  if (!parent) return undefined;

  for (const sibling of parent.children) {
    if (sibling === anchor) continue;
    const text = sibling.textContent?.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const match = text.match(/ in (.+)$/);
    if (match?.[1]) return match[1].trim();
  }
  return undefined;
}

/**
 * Extracts a geocodable one-line address from `card`: the listing anchor's
 * text (unit suffix stripped) plus, when findable, the card's neighborhood
 * line. Returns null only when the card has no address text at all — a
 * card whose address resolves but has no locatable neighborhood still
 * returns a usable (if slightly less precise) query.
 */
export function findListingAddress(card: Element): CardAddress | null {
  const anchor = findListingAnchor(card, { preferText: true });
  if (!anchor) return null;

  const rawStreet = anchor.textContent?.trim();
  if (!rawStreet) return null;

  const stripped = rawStreet.replace(UNIT_SUFFIX_PATTERN, '').trim();
  const street = stripped || rawStreet;

  const neighborhood = findNeighborhood(anchor);
  const query = neighborhood
    ? `${street}, ${neighborhood}, New York, NY`
    : `${street}, New York, NY`;

  return { query };
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

/**
 * A stable ancestor of the listing cards to hand a MutationObserver, if one
 * exists. Checked against the fixture: walking up from
 * `[data-testid="listing-card"]` (li -> ul -> div -> div -> div -> main)
 * turns up no data-testid, role, or any other non-build-hashed attribute —
 * only CSS-module class names like "SearchResults_container__zgUq4", whose
 * suffix changes on every StreetEasy deploy. Hardcoding one of those would
 * be exactly the kind of fragile selector this file exists to avoid.
 * Returns null so callers fall back to observing document.body; the
 * observer's debounce + relevance filter (see observer.ts) keep that cheap.
 */
export function findResultsContainer(doc: Document): Element | null {
  return null;
}
