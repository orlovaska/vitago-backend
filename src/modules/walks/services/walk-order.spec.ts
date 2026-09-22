import { describe, expect, it } from 'vitest';
import { inWalkOrder } from './walks.service';

/**
 * A walk is assembled from points of several tours, so the position a point
 * holds in its own tour says nothing about where it comes in the walk.
 */
const contents = [
  { id: 'hermitage', tourId: 'nevsky', position: 7, isFree: true },
  { id: 'spit', tourId: 'islands', position: 0, isFree: false },
  { id: 'rostral', tourId: 'islands', position: 7, isFree: false },
];

describe('inWalkOrder', () => {
  it('numbers the points by their place in the walk, not in their tour', () => {
    const points = inWalkOrder(contents, () => true);

    expect(points.map((point) => point.position)).toEqual([0, 1, 2]);
  });

  it('keeps the order it was given: the route was drawn through it', () => {
    const points = inWalkOrder(contents, () => true);

    expect(points.map((point) => point.id)).toEqual(['hermitage', 'spit', 'rostral']);
  });

  it('separates points that shared a position in different tours', () => {
    const points = inWalkOrder(contents, () => true);
    const positions = points.map((point) => point.position);

    expect(new Set(positions).size).toBe(positions.length);
  });

  it('carries the access decision through untouched', () => {
    const points = inWalkOrder(contents, (point) => point.isFree);

    expect(points.map((point) => point.accessible)).toEqual([true, false, false]);
  });
});
