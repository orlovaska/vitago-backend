import { describe, expect, it } from 'vitest';
import {
  legsOf,
  minimumBudgetSeconds,
  selectPoints,
  worstPoint,
  type SelectionInput,
} from './walk-selection';

/**
 * Places on a straight line: walking between two of them takes as many
 * seconds as the distance between their marks. Easy to reason about by hand.
 */
const line = (marks: number[]) => marks.map((from) => marks.map((to) => Math.abs(from - to)));

const VISIT = 60;
const candidates = (...indices: number[]) =>
  indices.map((index) => ({ index, visitSeconds: VISIT }));

describe('selectPoints', () => {
  describe('a walk that returns to its start', () => {
    // Start at 0; points 100, 200 and 300 seconds along the line.
    const base: Omit<SelectionInput, 'budgetSeconds'> = {
      matrix: line([0, 100, 200, 300]),
      startIndex: 0,
      endIndex: 0,
      candidates: candidates(1, 2, 3),
      maxPasses: 3,
    };

    it('counts the way back, so it fits fewer points than a one-way walk would', () => {
      const selection = selectPoints({ ...base, budgetSeconds: 600 });

      // 0 -> 100 -> 200 -> 0 is 400 seconds of walking plus two visits.
      expect(selection.order).toEqual([1, 2]);
      expect(selection.walkingSeconds).toBe(400);
      expect(selection.visitSeconds).toBe(120);
      expect(selection.walkingSeconds + selection.visitSeconds).toBeLessThanOrEqual(600);
    });

    it('never goes over the budget, whatever it is', () => {
      for (const budgetSeconds of [0, 100, 260, 500, 600, 900, 1200, 3600]) {
        const selection = selectPoints({ ...base, budgetSeconds });
        expect(selection.walkingSeconds + selection.visitSeconds).toBeLessThanOrEqual(
          budgetSeconds,
        );
      }
    });

    it('takes nothing when even the nearest point does not fit', () => {
      const selection = selectPoints({ ...base, budgetSeconds: 200 });
      expect(selection.order).toEqual([]);
      expect(selection.walkingSeconds).toBe(0);
    });

    it('fills the whole line when there is time for it', () => {
      const selection = selectPoints({ ...base, budgetSeconds: 1200 });
      expect(selection.order).toEqual([1, 2, 3]);
      // Out to the far point and back, visiting the others on the way.
      expect(selection.walkingSeconds).toBe(600);
      expect(selection.visitSeconds).toBe(180);
    });
  });

  describe('a walk that ends somewhere else', () => {
    // Start at 0, end at 400, with points in between.
    const base: Omit<SelectionInput, 'budgetSeconds'> = {
      matrix: line([0, 100, 200, 300, 400]),
      startIndex: 0,
      endIndex: 4,
      candidates: candidates(1, 2, 3),
      maxPasses: 3,
    };

    it('spends the budget on points instead of on the way back', () => {
      const selection = selectPoints({ ...base, budgetSeconds: 600 });

      expect(selection.order).toEqual([1, 2, 3]);
      expect(selection.walkingSeconds).toBe(400);
      expect(selection.visitSeconds).toBe(180);
    });

    it('keeps the finish in the budget even when nothing else fits', () => {
      const selection = selectPoints({ ...base, budgetSeconds: 400 });
      expect(selection.order).toEqual([]);
      expect(selection.walkingSeconds).toBe(400);
    });
  });

  it('leaves out a point the engine cannot reach', () => {
    const matrix = line([0, 100, 200]);
    matrix[0]![2] = Number.POSITIVE_INFINITY;
    matrix[2]![0] = Number.POSITIVE_INFINITY;
    matrix[1]![2] = Number.POSITIVE_INFINITY;
    matrix[2]![1] = Number.POSITIVE_INFINITY;

    const selection = selectPoints({
      matrix,
      startIndex: 0,
      endIndex: 0,
      candidates: candidates(1, 2),
      budgetSeconds: 3600,
      maxPasses: 3,
    });

    expect(selection.order).toEqual([1]);
    expect(Number.isFinite(selection.walkingSeconds)).toBe(true);
  });

  it('puts the points in a sensible order rather than the order they came in', () => {
    // The candidates arrive far, near, middle; walking them that way is longer.
    const selection = selectPoints({
      matrix: line([0, 300, 100, 200]),
      startIndex: 0,
      endIndex: 0,
      candidates: candidates(1, 2, 3),
      budgetSeconds: 1200,
      maxPasses: 3,
    });

    expect(selection.order).toEqual([2, 3, 1]);
    expect(selection.walkingSeconds).toBe(600);
  });
});

describe('minimumBudgetSeconds', () => {
  it('is the shortest walk to one point and back', () => {
    const minimum = minimumBudgetSeconds({
      matrix: line([0, 100, 400]),
      startIndex: 0,
      endIndex: 0,
      candidates: candidates(1, 2),
      maxPasses: 3,
    });
    expect(minimum).toBe(260);
  });

  it('is nothing at all when there are no candidates', () => {
    const minimum = minimumBudgetSeconds({
      matrix: line([0]),
      startIndex: 0,
      endIndex: 0,
      candidates: [],
      maxPasses: 3,
    });
    expect(minimum).toBeNull();
  });

  it('ignores points the engine cannot reach', () => {
    const matrix = line([0, 100, 400]);
    matrix[0]![1] = Number.POSITIVE_INFINITY;
    const minimum = minimumBudgetSeconds({
      matrix,
      startIndex: 0,
      endIndex: 0,
      candidates: candidates(1, 2),
      maxPasses: 3,
    });
    expect(minimum).toBe(860);
  });
});

describe('worstPoint', () => {
  it('picks the one whose detour buys the least', () => {
    const matrix = line([0, 100, 900]);
    const visitOf = new Map([
      [1, VISIT],
      [2, VISIT],
    ]);
    expect(worstPoint(matrix, 0, 0, [1, 2], visitOf)).toBe(2);
  });

  it('has nothing to drop from an empty walk', () => {
    expect(worstPoint(line([0]), 0, 0, [], new Map())).toBeNull();
  });
});

describe('legsOf', () => {
  it('adds the way to the first point and back from the last', () => {
    expect(legsOf(line([0, 100, 200]), 0, 0, [1, 2])).toBe(400);
  });
});
