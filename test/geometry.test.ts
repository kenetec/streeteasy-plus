import { describe, expect, it } from 'vitest';
import {
  pointInMultiPolygon,
  pointInPolygon,
  pointInRing,
} from '../src/lib/geometry';
import type {
  MultiPolygonCoords,
  PolygonCoords,
  Position,
} from '../src/lib/geometry';

// Unit square: (0,0) -> (10,0) -> (10,10) -> (0,10) -> close.
const unitSquare: Position[] = [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10],
  [0, 0],
];

describe('pointInRing', () => {
  it('is true for a point in the center', () => {
    expect(pointInRing([5, 5], unitSquare)).toBe(true);
  });

  it('is false for points clearly outside each side', () => {
    expect(pointInRing([-5, 5], unitSquare)).toBe(false); // left
    expect(pointInRing([15, 5], unitSquare)).toBe(false); // right
    expect(pointInRing([5, -5], unitSquare)).toBe(false); // below
    expect(pointInRing([5, 15], unitSquare)).toBe(false); // above
  });

  it('is false for a point far away', () => {
    expect(pointInRing([1000, 1000], unitSquare)).toBe(false);
  });
});

describe('pointInPolygon', () => {
  // Square band from (0,0)-(20,20) with a square hole from (5,5)-(15,15).
  const exterior: Position[] = [
    [0, 0],
    [20, 0],
    [20, 20],
    [0, 20],
    [0, 0],
  ];
  const hole: Position[] = [
    [5, 5],
    [15, 5],
    [15, 15],
    [5, 15],
    [5, 5],
  ];
  const squareWithHole: PolygonCoords = [exterior, hole];

  it('is true in the band between exterior and hole', () => {
    expect(pointInPolygon([2, 2], squareWithHole)).toBe(true);
  });

  it('is false inside the hole', () => {
    expect(pointInPolygon([10, 10], squareWithHole)).toBe(false);
  });

  it('is false outside the exterior entirely', () => {
    expect(pointInPolygon([100, 100], squareWithHole)).toBe(false);
  });

  it('handles a concave (U-shaped) polygon correctly', () => {
    // U shape: a 10x10 square missing a 4-wide, 6-tall notch cut from the
    // top-middle down toward (but not through) the base. Naive bounding-box
    // checks would call the notch "inside"; ray casting must not.
    const uShape: Position[] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [7, 10],
      [7, 4],
      [3, 4],
      [3, 10],
      [0, 10],
      [0, 0],
    ];
    const polygon: PolygonCoords = [uShape];

    // Inside the notch (empty space between the two prongs).
    expect(pointInPolygon([5, 8], polygon)).toBe(false);
    // Inside the left prong of the U.
    expect(pointInPolygon([1.5, 8], polygon)).toBe(true);
    // Inside the base of the U.
    expect(pointInPolygon([5, 1], polygon)).toBe(true);
  });

  it('handles realistic NYC-scale coordinates without lon/lat swap bugs', () => {
    // Small polygon around a point near Union Square, Manhattan.
    const nycSquare: Position[] = [
      [-73.99, 40.735],
      [-73.98, 40.735],
      [-73.98, 40.745],
      [-73.99, 40.745],
      [-73.99, 40.735],
    ];
    const polygon: PolygonCoords = [nycSquare];

    // Inside the polygon.
    expect(pointInPolygon([-73.985, 40.74], polygon)).toBe(true);
    // Across the East River in Brooklyn/Queens — clearly outside, and would
    // false-positive as "inside" if lng/lat were swapped.
    expect(pointInPolygon([-73.95, 40.7], polygon)).toBe(false);
  });

  it('does not double-count a ray passing exactly through a vertex', () => {
    // Diamond (rotated square) with a vertex at (10, 5) — a horizontal ray
    // from a point at y=5 toward the right passes exactly through that
    // vertex, the classic double-toggle bug.
    const diamond: Position[] = [
      [5, 0],
      [10, 5],
      [5, 10],
      [0, 5],
      [5, 0],
    ];
    const polygon: PolygonCoords = [diamond];

    // Unambiguously inside, on the same horizontal line as the (10,5) vertex.
    expect(pointInPolygon([5, 5], polygon)).toBe(true);
    // Unambiguously outside, beyond the vertex on that same line.
    expect(pointInPolygon([12, 5], polygon)).toBe(false);
  });
});

describe('pointInMultiPolygon', () => {
  const squareA: PolygonCoords = [
    [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ],
  ];
  const squareB: PolygonCoords = [
    [
      [100, 100],
      [110, 100],
      [110, 110],
      [100, 110],
      [100, 100],
    ],
  ];
  const twoSquares: MultiPolygonCoords = [squareA, squareB];

  it('is true inside each disjoint member polygon', () => {
    expect(pointInMultiPolygon([5, 5], twoSquares)).toBe(true);
    expect(pointInMultiPolygon([105, 105], twoSquares)).toBe(true);
  });

  it('is false between the two disjoint polygons', () => {
    expect(pointInMultiPolygon([50, 50], twoSquares)).toBe(false);
  });

  it('is false for an empty MultiPolygon', () => {
    const empty: MultiPolygonCoords = [];
    expect(pointInMultiPolygon([5, 5], empty)).toBe(false);
  });
});
