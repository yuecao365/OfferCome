import assert from "node:assert/strict";
import test from "node:test";

import { NodeDOMMatrix, ensureDomMatrix } from "./dom-matrix-polyfill";

/**
 * pdfjs 在 Node 下依赖这个 polyfill 才能加载（模块顶层就构造 DOMMatrix），
 * 所以这里锁住它真的按仿射矩阵语义计算，而不只是"不抛错"。
 */

function values(matrix: NodeDOMMatrix): number[] {
  return [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f].map(
    (value) => Number(value.toFixed(6)),
  );
}

test("默认是单位矩阵，可从数组与对象构造", () => {
  assert.deepEqual(values(new NodeDOMMatrix()), [1, 0, 0, 1, 0, 0]);
  assert.equal(new NodeDOMMatrix().isIdentity, true);
  assert.deepEqual(values(new NodeDOMMatrix([2, 0, 0, 3, 4, 5])), [2, 0, 0, 3, 4, 5]);
  assert.deepEqual(
    values(new NodeDOMMatrix({ a: 1, b: 2, c: 3, d: 4, e: 5, f: 6 })),
    [1, 2, 3, 4, 5, 6],
  );
});

test("scaleSelf/translateSelf 按 pdfjs 的用法组合", () => {
  // pdf.worker.mjs 里的写法：new DOMMatrix().scaleSelf(1/w, -1/h).translateSelf(0, -h)
  const matrix = new NodeDOMMatrix().scaleSelf(1 / 100, -1 / 200).translateSelf(0, -200);
  assert.deepEqual(values(matrix), [0.01, 0, 0, -0.005, 0, 1]);
});

test("乘法区分左乘与右乘", () => {
  const scale = [2, 0, 0, 2, 0, 0];
  const translate = [1, 0, 0, 1, 10, 20];
  assert.deepEqual(
    values(new NodeDOMMatrix(scale).multiplySelf(translate)),
    [2, 0, 0, 2, 20, 40],
  );
  assert.deepEqual(
    values(new NodeDOMMatrix(scale).preMultiplySelf(translate)),
    [2, 0, 0, 2, 10, 20],
  );
});

test("求逆满足 M · M⁻¹ = I；奇异矩阵退化为 NaN", () => {
  const matrix = new NodeDOMMatrix([2, 0, 0, 2, 10, 20]);
  assert.deepEqual(values(matrix.multiply(matrix.inverse())), [1, 0, 0, 1, 0, 0]);
  assert.equal(Number.isNaN(new NodeDOMMatrix([0, 0, 0, 0, 0, 0]).invertSelf().a), true);
});

test("transformPoint 应用完整仿射变换", () => {
  const point = new NodeDOMMatrix([2, 0, 0, 3, 5, 7]).transformPoint({ x: 1, y: 1 });
  assert.deepEqual(point, { x: 7, y: 10 });
});

test("ensureDomMatrix 幂等，且不覆盖已有实现", () => {
  const scope = globalThis as { DOMMatrix?: unknown };
  const original = scope.DOMMatrix;
  try {
    delete scope.DOMMatrix;
    ensureDomMatrix();
    assert.equal(scope.DOMMatrix, NodeDOMMatrix);

    const native = class {};
    scope.DOMMatrix = native;
    ensureDomMatrix();
    assert.equal(scope.DOMMatrix, native);
  } finally {
    if (original === undefined) delete scope.DOMMatrix;
    else scope.DOMMatrix = original;
  }
});
