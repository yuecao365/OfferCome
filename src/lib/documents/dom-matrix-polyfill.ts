/**
 * Node 运行时的最小 DOMMatrix 实现。
 *
 * pdfjs-dist 在模块顶层就会 `new DOMMatrix()`（pdf.mjs 的 SCALE_MATRIX），
 * 浏览器里这是内置全局，Node 里没有——官方靠可选依赖 @napi-rs/canvas 兜底，
 * 缺了只打一句 warn，等真正用到时抛 "DOMMatrix is not defined"。
 * 我们只做文本提取，不渲染画布，为此拉一个几十兆的原生依赖不划算，
 * 所以在这里补齐 2D 仿射矩阵这一小块纯数学。
 *
 * 只实现 pdfjs 文本路径会碰到的 2D 部分；3D（m11…m44）不支持。
 */

type MatrixLike = {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
};

/** [a, b, c, d, e, f] 表示 [[a c e], [b d f], [0 0 1]]。 */
function multiply(left: MatrixLike, right: MatrixLike): number[] {
  return [
    left.a * right.a + left.c * right.b,
    left.b * right.a + left.d * right.b,
    left.a * right.c + left.c * right.d,
    left.b * right.c + left.d * right.d,
    left.a * right.e + left.c * right.f + left.e,
    left.b * right.e + left.d * right.f + left.f,
  ];
}

function parseInit(init?: unknown): number[] {
  if (Array.isArray(init)) {
    // 6 元（2D）或 16 元（3D）；3D 只取其中的 2D 分量。
    if (init.length === 6) return init.map(Number);
    if (init.length === 16) {
      const [m11, m12, , , m21, m22, , , , , , , m41, m42] = init.map(Number);
      return [m11, m12, m21, m22, m41, m42];
    }
  }
  if (init && typeof init === "object") {
    const source = init as Partial<MatrixLike>;
    if (typeof source.a === "number") {
      return [
        source.a,
        source.b ?? 0,
        source.c ?? 0,
        source.d ?? 1,
        source.e ?? 0,
        source.f ?? 0,
      ];
    }
  }
  return [1, 0, 0, 1, 0, 0];
}

class NodeDOMMatrix implements MatrixLike {
  a = 1;
  b = 0;
  c = 0;
  d = 1;
  e = 0;
  f = 0;

  constructor(init?: unknown) {
    this.#set(parseInit(init));
  }

  #set(values: number[]): this {
    [this.a, this.b, this.c, this.d, this.e, this.f] = values;
    return this;
  }

  get m11() { return this.a; }
  get m12() { return this.b; }
  get m21() { return this.c; }
  get m22() { return this.d; }
  get m41() { return this.e; }
  get m42() { return this.f; }
  get isIdentity(): boolean {
    return (
      this.a === 1 && this.b === 0 && this.c === 0 &&
      this.d === 1 && this.e === 0 && this.f === 0
    );
  }

  multiplySelf(other?: unknown): this {
    return this.#set(multiply(this, new NodeDOMMatrix(other)));
  }

  preMultiplySelf(other?: unknown): this {
    return this.#set(multiply(new NodeDOMMatrix(other), this));
  }

  translateSelf(tx = 0, ty = 0): this {
    return this.#set(multiply(this, { a: 1, b: 0, c: 0, d: 1, e: tx, f: ty }));
  }

  scaleSelf(scaleX = 1, scaleY = scaleX): this {
    return this.#set(
      multiply(this, { a: scaleX, b: 0, c: 0, d: scaleY, e: 0, f: 0 }),
    );
  }

  invertSelf(): this {
    const determinant = this.a * this.d - this.b * this.c;
    if (!determinant) {
      // 与浏览器行为一致：不可逆矩阵变成全 NaN。
      return this.#set([NaN, NaN, NaN, NaN, NaN, NaN]);
    }
    return this.#set([
      this.d / determinant,
      -this.b / determinant,
      -this.c / determinant,
      this.a / determinant,
      (this.c * this.f - this.d * this.e) / determinant,
      (this.b * this.e - this.a * this.f) / determinant,
    ]);
  }

  multiply(other?: unknown): NodeDOMMatrix {
    return new NodeDOMMatrix(this).multiplySelf(other);
  }

  translate(tx = 0, ty = 0): NodeDOMMatrix {
    return new NodeDOMMatrix(this).translateSelf(tx, ty);
  }

  scale(scaleX = 1, scaleY = scaleX): NodeDOMMatrix {
    return new NodeDOMMatrix(this).scaleSelf(scaleX, scaleY);
  }

  inverse(): NodeDOMMatrix {
    return new NodeDOMMatrix(this).invertSelf();
  }

  transformPoint(point?: { x?: number; y?: number }): { x: number; y: number } {
    const x = point?.x ?? 0;
    const y = point?.y ?? 0;
    return { x: this.a * x + this.c * y + this.e, y: this.b * x + this.d * y + this.f };
  }

  toFloat64Array(): Float64Array {
    return new Float64Array([this.a, this.b, this.c, this.d, this.e, this.f]);
  }

  toString(): string {
    return `matrix(${this.a}, ${this.b}, ${this.c}, ${this.d}, ${this.e}, ${this.f})`;
  }
}

export { NodeDOMMatrix };

/** 幂等：只在缺失时补上，浏览器与装了原生 canvas 的环境不受影响。 */
export function ensureDomMatrix(): void {
  const scope = globalThis as { DOMMatrix?: unknown };
  scope.DOMMatrix ??= NodeDOMMatrix;
}
