/**
 * Shared Book Stall closing math — pure integer functions (no database), unit-tested.
 * Per title: C = contributed, S = sold (net of reversals), R = remaining (physical count), L = C - S - R (loss).
 */

/** Split `total` across weights in proportion, whole numbers, largest remainder; ties go to the earlier entry. */
export function largestRemainder(total: number, weights: number[]): number[] {
  const W = weights.reduce((a, w) => a + w, 0);
  if (total <= 0 || W <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / W);
  const out = raw.map(Math.floor);
  let left = total - out.reduce((a, x) => a + x, 0);
  const order = raw.map((r, i) => ({ i, f: r - Math.floor(r) })).sort((a, b) => b.f - a.f || a.i - b.i);
  for (const { i } of order) {
    if (!left) break;
    out[i]++;
    left--;
  }
  return out;
}

export type OwnerAlloc = {
  userId: string;
  contributed: number;
  suggestedTakeHome: number;
  takeHome: number;
  loss: number;
  transferIn: number;
  transferOut: number;
  attributedSold: number;
};
export type Transfer = { from: string; to: string; qty: number };

/**
 * Allocate one title. `takeHome` overrides the default (proportional) returns; it must sum to `remaining`.
 * Taking home more than you contributed (after your share of loss) means copies move from other owners — a real transfer.
 */
export function allocateTitle(
  owners: { userId: string; contributed: number }[],
  sold: number,
  remaining: number,
  takeHome?: Map<string, number>,
): { rows: OwnerAlloc[]; transfers: Transfer[]; error?: string } {
  const C = owners.reduce((a, o) => a + o.contributed, 0);
  const L = C - sold - remaining;
  if (remaining < 0 || sold < 0) return { rows: [], transfers: [], error: "Numbers cannot be negative." };
  if (L < 0) return { rows: [], transfers: [], error: `Counted ${remaining} left, but only ${C - sold} can be left (${C} given − ${sold} sold). Please count again.` };
  const w = owners.map((o) => o.contributed);
  const suggested = largestRemainder(remaining, w);
  const loss = largestRemainder(L, w);
  const th = owners.map((o, i) => (takeHome ? takeHome.get(o.userId) ?? 0 : suggested[i]));
  if (th.some((x) => !Number.isInteger(x) || x < 0)) return { rows: [], transfers: [], error: "Take-home copies must be whole numbers, 0 or more." };
  const thSum = th.reduce((a, x) => a + x, 0);
  if (thSum !== remaining) return { rows: [], transfers: [], error: `Take-home copies add up to ${thSum}, but ${remaining} are left. They must match.` };

  const own = owners.map((o, i) => Math.min(th[i], o.contributed - loss[i])); // copies of your own you take back
  const excess = owners.map((_, i) => th[i] - own[i]); // copies you take that belonged to others
  const spare = owners.map((o, i) => o.contributed - loss[i] - own[i]); // your copies not taken back by you
  const need = excess.reduce((a, x) => a + x, 0);
  // Copies taken by others come from owners with spare copies, in proportion (largest remainder).
  const out = largestRemainder(need, spare);
  const transfers: Transfer[] = [];
  // Pair donors and receivers in order (deterministic).
  const give = [...out];
  owners.forEach((rcv, j) => {
    let want = excess[j];
    owners.forEach((don, i) => {
      if (!want || i === j || !give[i]) return;
      const q = Math.min(give[i], want);
      transfers.push({ from: don.userId, to: rcv.userId, qty: q });
      give[i] -= q;
      want -= q;
    });
  });
  const rows = owners.map((o, i) => ({
    userId: o.userId,
    contributed: o.contributed,
    suggestedTakeHome: suggested[i],
    takeHome: th[i],
    loss: loss[i],
    transferIn: excess[i],
    transferOut: out[i],
    attributedSold: o.contributed - loss[i] - own[i] - out[i],
  }));
  return { rows, transfers };
}
