/**
 * Choosing which points a walk visits and in what order, given how long it
 * takes to walk between every pair. Pure arithmetic on a matrix: no database,
 * no routing engine, so it can be reasoned about and tested on its own.
 *
 * Indices are positions in `matrix`, where `matrix[from][to]` is walking
 * seconds. The start and the end are indices too, and they are the same index
 * when the walk returns to where it began.
 */

export interface Candidate {
  index: number;
  /** Narration plus the fixed overhead: the time the walk spends at the point. */
  visitSeconds: number;
}

export interface SelectionInput {
  matrix: number[][];
  startIndex: number;
  endIndex: number;
  candidates: Candidate[];
  budgetSeconds: number;
  /** How many times to improve the order and try to refill the freed time. */
  maxPasses: number;
}

export interface Selection {
  /** Matrix indices of the chosen points, in walking order. */
  order: number[];
  walkingSeconds: number;
  visitSeconds: number;
}

/**
 * Fills the time budget with points, cheapest detour first, then shortens the
 * order and spends whatever that frees on more points. Greedy insertion with
 * 2-opt: a walk of a few dozen candidates is decided in milliseconds, and the
 * result only ever has to be good, not provably optimal.
 */
export function selectPoints(input: SelectionInput): Selection {
  const { matrix, startIndex, endIndex, budgetSeconds, maxPasses } = input;
  const visitOf = new Map(input.candidates.map((c) => [c.index, c.visitSeconds]));
  const remaining = new Set(input.candidates.map((c) => c.index));

  let order: number[] = [];
  let visitSeconds = 0;
  const walkingOf = (route: number[]) => legsOf(matrix, startIndex, endIndex, route);

  for (let pass = 0; pass < maxPasses; pass++) {
    let changed = false;

    // Fill: keep adding the point that costs the fewest extra seconds.
    for (;;) {
      const insertion = bestInsertion({
        matrix,
        startIndex,
        endIndex,
        order,
        remaining,
        visitOf,
        spare: budgetSeconds - walkingOf(order) - visitSeconds,
      });
      if (!insertion) break;
      order = [...order.slice(0, insertion.at), insertion.index, ...order.slice(insertion.at)];
      visitSeconds += visitOf.get(insertion.index) ?? 0;
      remaining.delete(insertion.index);
      changed = true;
    }

    // Shorten: a better order frees time that the next pass can spend.
    const shortened = twoOpt(matrix, startIndex, endIndex, order);
    if (walkingOf(shortened) < walkingOf(order)) {
      order = shortened;
      changed = true;
    }
    if (!changed) break;
  }

  const settled = canonicalDirection(matrix, startIndex, endIndex, order);
  return { order: settled, walkingSeconds: walkingOf(settled), visitSeconds };
}

/**
 * A walk that comes back to its start costs exactly the same walked in
 * reverse, so the algorithm has no reason to prefer either. Picking one keeps
 * the same request answered with the same route: it sets off towards the
 * nearer end of the loop.
 */
function canonicalDirection(
  matrix: number[][],
  startIndex: number,
  endIndex: number,
  order: readonly number[],
): number[] {
  if (startIndex !== endIndex || order.length < 2) return [...order];
  const first = order[0]!;
  const last = order[order.length - 1]!;
  const toFirst = matrix[startIndex]![first]!;
  const toLast = matrix[startIndex]![last]!;
  if (toLast < toFirst || (toLast === toFirst && last < first)) return [...order].reverse();
  return [...order];
}

/**
 * The shortest walk that visits a single point and still ends where it should.
 * Nothing can be built below this, so it is what the app offers the user when
 * the requested time is too small.
 */
export function minimumBudgetSeconds(input: Omit<SelectionInput, 'budgetSeconds'>): number | null {
  const { matrix, startIndex, endIndex } = input;
  const totals = input.candidates
    .map((c) => matrix[startIndex]![c.index]! + matrix[c.index]![endIndex]! + c.visitSeconds)
    .filter((total) => Number.isFinite(total));
  return totals.length === 0 ? null : Math.min(...totals);
}

/**
 * The point that buys the least: it adds the most walking for the time it is
 * worth. Dropping it is how a walk that came out too long gets back in budget.
 */
export function worstPoint(
  matrix: number[][],
  startIndex: number,
  endIndex: number,
  order: number[],
  visitOf: ReadonlyMap<number, number>,
): number | null {
  let worst: { index: number; cost: number } | null = null;
  for (const [position, index] of order.entries()) {
    const before = position === 0 ? startIndex : order[position - 1]!;
    const after = position === order.length - 1 ? endIndex : order[position + 1]!;
    const detour = matrix[before]![index]! + matrix[index]![after]! - matrix[before]![after]!;
    const visit = visitOf.get(index) ?? 0;
    const cost = (detour + visit) / Math.max(visit, 1);
    if (!worst || cost > worst.cost) worst = { index, cost };
  }
  return worst?.index ?? null;
}

/** Walking seconds of start → order → end. */
export function legsOf(
  matrix: number[][],
  startIndex: number,
  endIndex: number,
  order: readonly number[],
): number {
  let total = 0;
  let from = startIndex;
  for (const index of order) {
    total += matrix[from]![index]!;
    from = index;
  }
  return total + matrix[from]![endIndex]!;
}

interface InsertionInput {
  matrix: number[][];
  startIndex: number;
  endIndex: number;
  order: readonly number[];
  remaining: ReadonlySet<number>;
  visitOf: ReadonlyMap<number, number>;
  /** Seconds still free in the budget. */
  spare: number;
}

function bestInsertion(input: InsertionInput): { index: number; at: number } | null {
  const { matrix, startIndex, endIndex, order, remaining, visitOf, spare } = input;
  let best: { index: number; at: number; cost: number } | null = null;

  for (const index of remaining) {
    const visit = visitOf.get(index) ?? 0;
    for (let at = 0; at <= order.length; at++) {
      const before = at === 0 ? startIndex : order[at - 1]!;
      const after = at === order.length ? endIndex : order[at]!;
      const detour = matrix[before]![index]! + matrix[index]![after]! - matrix[before]![after]!;
      const cost = detour + visit;
      if (!Number.isFinite(cost) || cost > spare) continue;
      if (!best || cost < best.cost) best = { index, at, cost };
    }
  }
  return best && { index: best.index, at: best.at };
}

/** Reverses the stretch that saves the most, until nothing saves anything. */
function twoOpt(
  matrix: number[][],
  startIndex: number,
  endIndex: number,
  order: readonly number[],
): number[] {
  let best = [...order];
  if (best.length < 2) return best;
  // Bounded so a matrix with odd values can never spin here.
  for (let round = 0; round < best.length; round++) {
    let improved = false;
    for (let i = 0; i < best.length - 1; i++) {
      for (let j = i + 1; j < best.length; j++) {
        const candidate = [
          ...best.slice(0, i),
          ...best.slice(i, j + 1).reverse(),
          ...best.slice(j + 1),
        ];
        if (
          legsOf(matrix, startIndex, endIndex, candidate) <
          legsOf(matrix, startIndex, endIndex, best)
        ) {
          best = candidate;
          improved = true;
        }
      }
    }
    if (!improved) break;
  }
  return best;
}
