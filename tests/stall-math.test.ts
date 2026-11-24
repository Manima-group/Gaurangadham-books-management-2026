import assert from "node:assert/strict";
import { allocateTitle, largestRemainder } from "../src/lib/stall-math";

let n = 0;
const t = (name: string, f: () => void) => { f(); n++; console.log("PASS", name); };
const owners = [{ userId: "ravi", contributed: 15 }, { userId: "krishna", contributed: 5 }, { userId: "sita", contributed: 5 }];
const pick = (r: ReturnType<typeof allocateTitle>, k: "takeHome" | "attributedSold") => r.rows.map((x) => x[k]);

t("largest remainder sums exactly", () => { for (const [tot, w] of [[10, [1, 1, 1]], [7, [3, 2, 2]], [0, [1, 2]], [5, [0, 0]]] as [number, number[]][]) { const o = largestRemainder(tot, w); assert.equal(o.reduce((a, x) => a + x, 0), w.some(Boolean) ? tot : 0); } });
t("ties go to earlier entry", () => assert.deepEqual(largestRemainder(1, [1, 1, 1]), [1, 0, 0]));
t("15/5/5, 10 sold -> returns 9/3/3, sold 6/2/2", () => { const r = allocateTitle(owners, 10, 15); assert.deepEqual(pick(r, "takeHome"), [9, 3, 3]); assert.deepEqual(pick(r, "attributedSold"), [6, 2, 2]); assert.equal(r.transfers.length, 0); });
t("edited 11/2/2 -> sold 4/3/3", () => { const r = allocateTitle(owners, 10, 15, new Map([["ravi", 11], ["krishna", 2], ["sita", 2]])); assert.deepEqual(pick(r, "attributedSold"), [4, 3, 3]); });
t("take home more than contributed -> transfer", () => {
  const r = allocateTitle(owners, 10, 15, new Map([["ravi", 5], ["krishna", 8], ["sita", 2]]));
  assert.ok(!r.error);
  // Krishna takes 8 of 5 given: 3 come from Ravi and Sita in proportion to their spare copies (10 and 3) -> 2 and 1.
  assert.deepEqual(r.transfers, [{ from: "ravi", to: "krishna", qty: 2 }, { from: "sita", to: "krishna", qty: 1 }]);
  assert.equal(r.rows.reduce((a, x) => a + x.attributedSold, 0), 10);
  assert.deepEqual(pick(r, "attributedSold"), [8, 0, 2]);
});
t("loss shared proportionally; sold total preserved", () => { const r = allocateTitle(owners, 10, 10); assert.equal(r.rows.reduce((a, x) => a + x.loss, 0), 5); assert.equal(r.rows.reduce((a, x) => a + x.attributedSold, 0), 10); });
t("count more than possible -> error", () => assert.ok(allocateTitle(owners, 10, 16).error));
t("take-home must match remaining", () => assert.ok(allocateTitle(owners, 10, 15, new Map([["ravi", 1]])).error));
t("every case conserves copies", () => {
  for (let s = 0; s <= 25; s++) for (let rem = 0; rem <= 25 - s; rem++) {
    const r = allocateTitle(owners, s, rem); assert.ok(!r.error);
    for (const x of r.rows) assert.equal(x.takeHome + x.attributedSold + x.loss + x.transferOut - x.transferIn, x.contributed);
    assert.equal(r.rows.reduce((a, x) => a + x.attributedSold, 0), s);
  }
});
console.log(`${n}/${n} stall-math tests passed`);
