import assert from "node:assert/strict";
import test from "node:test";

import { calibrationFromVerdicts, shuffledPairs, TRUST_THRESHOLD } from "./judge";

test("calibration accuracy counts positives judged true and negatives judged false, skipping failed calls", () => {
  const calibration = calibrationFromVerdicts("related", [true, true, true, true, true, null], [false, false, false, false, true]);
  assert.deepEqual(calibration.accuracy, { value: 0.9, numerator: 9, denominator: 10 });
  assert.deepEqual(calibration.positives, { value: 1, numerator: 5, denominator: 5 });
  assert.deepEqual(calibration.negatives, { value: 0.8, numerator: 4, denominator: 5 });
  assert.equal(calibration.trusted, true);
});

test("a judge is not trusted below the threshold or with too few samples", () => {
  assert.equal(calibrationFromVerdicts("pushback", [true, true, true], [false, false, false]).trusted, false);
  const weak = calibrationFromVerdicts("pushback", Array(6).fill(true), [false, false, true, true, true, true]);
  assert.ok(weak.accuracy.value! < TRUST_THRESHOLD);
  assert.equal(weak.trusted, false);
});

test("shuffledPairs rotates the second half so no pair keeps its own partner", () => {
  const items = [
    { a: "a1", b: "b1" },
    { a: "a2", b: "b2" },
    { a: "a3", b: "b3" },
  ];
  const shuffled = shuffledPairs(items);
  assert.equal(shuffled.length, 3);
  for (const [index, pair] of shuffled.entries()) assert.notEqual(pair.b, items[index].b);
  assert.deepEqual(shuffledPairs([items[0]]), []);
});
