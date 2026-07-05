// Pure point-in-polygon geometry for testing a listing's coordinates against
// a commute isochrone (see src/lib/geoapify.ts for how isochrones are
// fetched and normalized to MultiPolygon). No chrome APIs, no logging, no
// dependencies — this module is wired into the content-script filter step
// in a later PR.

/**
 * A GeoJSON position: [lng, lat] — longitude first, latitude second.
 *
 * This is the GeoJSON spec order, NOT the more common "lat, lng" order used
 * elsewhere (e.g. src/types.ts's LatLng). Swapping them is the classic bug
 * in this domain: NYC coordinates are lat ~40.7, lng ~-73.9, and a swapped
 * pair still parses as valid numbers — it just silently tests against a
 * point in the Indian Ocean, so every `pointInMultiPolygon` call returns
 * false with no error.
 */
export type Position = [number, number];

/** A closed ring of positions: first and last points should coincide. */
export type LinearRing = Position[];

/** A GeoJSON Polygon's coordinates: [exterior ring, ...hole rings]. */
export type PolygonCoords = LinearRing[];

/** A GeoJSON MultiPolygon's coordinates: one entry per (disjoint) polygon. */
export type MultiPolygonCoords = PolygonCoords[];

/**
 * Ray-casting point-in-ring test (even-odd rule).
 *
 * `point` and `ring` positions must be in GeoJSON [lng, lat] order.
 *
 * Points exactly on an edge or vertex may return either true or false —
 * this is not pinned down. For commute filtering at ~1-meter precision,
 * boundary ambiguity is irrelevant, and leaving it unpinned keeps the
 * implementation simple.
 */
export function pointInRing(point: Position, ring: LinearRing): boolean {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i] as Position;
    const [xj, yj] = ring[j] as Position;
    const intersects =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/**
 * Point-in-polygon test: inside the exterior ring (index 0) and not inside
 * any hole ring (indices 1+).
 *
 * `point` and `polygon` positions must be in GeoJSON [lng, lat] order.
 * Boundary points (on an edge/vertex) may return either value — see
 * `pointInRing`.
 */
export function pointInPolygon(point: Position, polygon: PolygonCoords): boolean {
  const exterior = polygon[0];
  if (!exterior || !pointInRing(point, exterior)) return false;
  for (let i = 1; i < polygon.length; i++) {
    if (pointInRing(point, polygon[i] as LinearRing)) return false;
  }
  return true;
}

/**
 * Point-in-multipolygon test: true if the point is inside any member
 * polygon. Transit isochrones are disjoint blobs around stations, so this
 * short-circuits on the first match — the hot path for listing filtering.
 *
 * `point` and `mp` positions must be in GeoJSON [lng, lat] order.
 * Boundary points (on an edge/vertex) may return either value — see
 * `pointInRing`.
 */
export function pointInMultiPolygon(
  point: Position,
  mp: MultiPolygonCoords
): boolean {
  for (const polygon of mp) {
    if (pointInPolygon(point, polygon)) return true;
  }
  return false;
}
