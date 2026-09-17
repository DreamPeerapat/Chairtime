/**
 * Drawing a QR code.
 *
 * `promptPayPayload` produces the string a banking app must read; this turns
 * that string into the squares. It is here rather than in a dependency
 * because the alternative was sending the payee's id and the amount to an
 * image service on every page load, and because a QR code is a specification,
 * not a moving target: ISO/IEC 18004 has not changed since 2015 and neither
 * will this file.
 *
 * Deliberately narrow — byte mode, error correction level M, versions 1 to
 * 10. That is up to 213 bytes, and a PromptPay payload is about eighty. A
 * wider encoder would be four more capacity tables to get right for input
 * this product never produces.
 *
 * Level M recovers 15% of a damaged symbol. It is what Thai banks print, and
 * a phone camera pointed at a laptop screen at an angle needs the slack.
 *
 * The symbol this produces was checked by decoding it again, at every version
 * it can reach; `tests/unit/qr.test.ts` holds a fingerprint of one so a later
 * edit cannot quietly turn it back into an unreadable square of dots.
 */

/**
 * Per version: error-correction codewords per block, and how the data splits
 * into blocks as [blocks, data codewords each]. Two groups from version 8,
 * where the blocks are not all the same length — the longer ones come second.
 */
interface VersionSpec {
  ecPerBlock: number;
  groups: [number, number][];
}

/** Indexed by version - 1. Level M throughout. */
const VERSIONS: VersionSpec[] = [
  { ecPerBlock: 10, groups: [[1, 16]] },
  { ecPerBlock: 16, groups: [[1, 28]] },
  { ecPerBlock: 26, groups: [[1, 44]] },
  { ecPerBlock: 18, groups: [[2, 32]] },
  { ecPerBlock: 24, groups: [[2, 43]] },
  { ecPerBlock: 16, groups: [[4, 27]] },
  { ecPerBlock: 18, groups: [[4, 31]] },
  {
    ecPerBlock: 22,
    groups: [
      [2, 38],
      [2, 39],
    ],
  },
  {
    ecPerBlock: 22,
    groups: [
      [3, 36],
      [2, 37],
    ],
  },
  {
    ecPerBlock: 26,
    groups: [
      [4, 43],
      [1, 44],
    ],
  },
];

/** Centres of the alignment patterns, in both axes. Version 1 has none. */
const ALIGNMENT: number[][] = [
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
];

const MAX_VERSION = VERSIONS.length;

function specFor(version: number): VersionSpec {
  const spec = VERSIONS[version - 1];
  if (!spec) throw new Error(`no table for QR version ${version}`);
  return spec;
}

function dataCodewords(spec: VersionSpec): number {
  return spec.groups.reduce((sum, [blocks, each]) => sum + blocks * each, 0);
}

// ---------------------------------------------------------------------------
// GF(256)
// ---------------------------------------------------------------------------

/**
 * The field the error correction lives in: arithmetic modulo the primitive
 * polynomial 0x11d, which is the one QR specifies. Multiplication becomes
 * addition of logarithms, so both tables are built once at module load.
 */
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);

{
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  // Doubled so a product of two logarithms never needs a modulo on lookup.
  for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255] ?? 0;
}

const exp = (i: number): number => EXP[i] ?? 0;
const log = (i: number): number => LOG[i] ?? 0;

function gfMultiply(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return exp(log(a) + log(b));
}

/** (x - a^0)(x - a^1)...(x - a^(degree-1)), coefficients high order first. */
function generatorPoly(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i += 1) {
    const next = new Array<number>(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j += 1) {
      const coefficient = poly[j] ?? 0;
      next[j] = (next[j] ?? 0) ^ coefficient;
      next[j + 1] = (next[j + 1] ?? 0) ^ gfMultiply(coefficient, exp(i));
    }
    poly = next;
  }
  return poly;
}

/**
 * The remainder of the data polynomial divided by the generator — the error
 * correction codewords, which is what lets a scanner read a symbol with a
 * thumb over part of it.
 */
export function reedSolomon(data: readonly number[], ecLength: number): number[] {
  const generator = generatorPoly(ecLength);
  const remainder = new Array<number>(ecLength).fill(0);

  for (const byte of data) {
    const factor = byte ^ (remainder[0] ?? 0);
    remainder.shift();
    remainder.push(0);
    if (factor !== 0) {
      for (let i = 0; i < ecLength; i += 1) {
        remainder[i] = (remainder[i] ?? 0) ^ gfMultiply(generator[i + 1] ?? 0, factor);
      }
    }
  }

  return remainder;
}

// ---------------------------------------------------------------------------
// Bit stream
// ---------------------------------------------------------------------------

class BitBuffer {
  private bits: number[] = [];

  push(value: number, length: number): void {
    for (let i = length - 1; i >= 0; i -= 1) {
      this.bits.push((value >>> i) & 1);
    }
  }

  get length(): number {
    return this.bits.length;
  }

  /** Pad to a byte boundary and hand back the codewords. */
  toCodewords(): number[] {
    while (this.bits.length % 8 !== 0) this.bits.push(0);
    const bytes: number[] = [];
    for (let i = 0; i < this.bits.length; i += 8) {
      let byte = 0;
      for (let j = 0; j < 8; j += 1) byte = (byte << 1) | (this.bits[i + j] ?? 0);
      bytes.push(byte);
    }
    return bytes;
  }
}

/** Versions 1–9 count the bytes in 8 bits; from 10 it takes 16. */
function countBits(version: number): number {
  return version < 10 ? 8 : 16;
}

function pickVersion(byteLength: number): number {
  for (let version = 1; version <= MAX_VERSION; version += 1) {
    const capacity = dataCodewords(specFor(version)) * 8;
    if (4 + countBits(version) + byteLength * 8 <= capacity) return version;
  }
  throw new Error(`payload of ${byteLength} bytes is too long for a version ${MAX_VERSION} QR`);
}

/** Mode indicator, length, the bytes, terminator, then the specified padding. */
function encodeData(bytes: Uint8Array, version: number): number[] {
  const capacity = dataCodewords(specFor(version));
  const buffer = new BitBuffer();

  buffer.push(0b0100, 4); // byte mode
  buffer.push(bytes.length, countBits(version));
  for (const byte of bytes) buffer.push(byte, 8);

  buffer.push(0, Math.min(4, capacity * 8 - buffer.length));

  const codewords = buffer.toCodewords();
  // 236 then 17, alternating, is what the standard names — not zeroes, which
  // would leave a long empty run for a scanner to lose its place in.
  const PAD = [0b11101100, 0b00010001];
  for (let i = 0; codewords.length < capacity; i += 1) codewords.push(PAD[i % 2] ?? 0);

  return codewords;
}

/**
 * Split into blocks, protect each one, then interleave: the first codeword of
 * every block, then the second, and so on. Interleaving turns a scratch
 * across the symbol into a little damage in many blocks rather than the loss
 * of a whole one.
 */
function interleave(codewords: number[], version: number): number[] {
  const spec = specFor(version);
  const dataBlocks: number[][] = [];
  const ecBlocks: number[][] = [];

  let offset = 0;
  for (const [blocks, each] of spec.groups) {
    for (let i = 0; i < blocks; i += 1) {
      const block = codewords.slice(offset, offset + each);
      offset += each;
      dataBlocks.push(block);
      ecBlocks.push(reedSolomon(block, spec.ecPerBlock));
    }
  }

  const result: number[] = [];
  const longest = Math.max(...dataBlocks.map((b) => b.length));
  for (let i = 0; i < longest; i += 1) {
    for (const block of dataBlocks) {
      const codeword = block[i];
      if (codeword !== undefined) result.push(codeword);
    }
  }
  for (let i = 0; i < spec.ecPerBlock; i += 1) {
    for (const block of ecBlocks) result.push(block[i] ?? 0);
  }

  return result;
}

// ---------------------------------------------------------------------------
// The grid
// ---------------------------------------------------------------------------

/**
 * The square, as two flat arrays: what is dark, and what is a function
 * pattern. The second is what data placement steps over and what masking
 * leaves alone — a mask applied to a finder pattern is a symbol no scanner
 * can lock on to.
 */
class Grid {
  readonly size: number;
  private readonly dark: Uint8Array;
  private readonly fixed: Uint8Array;

  constructor(version: number) {
    this.size = version * 4 + 17;
    this.dark = new Uint8Array(this.size * this.size);
    this.fixed = new Uint8Array(this.size * this.size);
  }

  private index(x: number, y: number): number {
    return y * this.size + x;
  }

  get(x: number, y: number): boolean {
    return this.dark[this.index(x, y)] === 1;
  }

  isFixed(x: number, y: number): boolean {
    return this.fixed[this.index(x, y)] === 1;
  }

  /** A function module: drawn, and never touched again. */
  fix(x: number, y: number, dark: boolean): void {
    const i = this.index(x, y);
    this.dark[i] = dark ? 1 : 0;
    this.fixed[i] = 1;
  }

  /** A data or format module: drawn, and still maskable. */
  put(x: number, y: number, dark: boolean): void {
    this.dark[this.index(x, y)] = dark ? 1 : 0;
  }

  flip(x: number, y: number): void {
    const i = this.index(x, y);
    this.dark[i] = this.dark[i] === 1 ? 0 : 1;
  }

  toModules(): boolean[][] {
    return Array.from({ length: this.size }, (_, y) =>
      Array.from({ length: this.size }, (_, x) => this.get(x, y)),
    );
  }
}

export interface QrCode {
  /** modules per side, not counting the quiet zone */
  size: number;
  /** true is dark; addressed as modules[y][x] */
  modules: boolean[][];
  version: number;
}

function drawFinder(grid: Grid, x0: number, y0: number): void {
  // One module wider than the pattern on every side: that border is the
  // separator, and it is what tells a scanner where the finder stops.
  for (let dy = -1; dy <= 7; dy += 1) {
    for (let dx = -1; dx <= 7; dx += 1) {
      const x = x0 + dx;
      const y = y0 + dy;
      if (x < 0 || y < 0 || x >= grid.size || y >= grid.size) continue;
      const ring = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
      grid.fix(x, y, ring !== 2 && ring <= 3);
    }
  }
}

function drawAlignment(grid: Grid, cx: number, cy: number): void {
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      grid.fix(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }
}

function drawFunctionPatterns(grid: Grid, version: number): void {
  const last = grid.size - 7;
  drawFinder(grid, 0, 0);
  drawFinder(grid, last, 0);
  drawFinder(grid, 0, last);

  // Timing: the alternating line a scanner measures the module pitch against.
  for (let i = 8; i < grid.size - 8; i += 1) {
    grid.fix(i, 6, i % 2 === 0);
    grid.fix(6, i, i % 2 === 0);
  }

  const centres = ALIGNMENT[version - 1] ?? [];
  for (const cy of centres) {
    for (const cx of centres) {
      // Not where the three finders already are.
      const nearFinder =
        (cx <= 8 && cy <= 8) || (cx <= 8 && cy >= grid.size - 9) || (cx >= grid.size - 9 && cy <= 8);
      if (!nearFinder) drawAlignment(grid, cx, cy);
    }
  }

  // The module the standard fixes dark, beside the bottom-left finder.
  grid.fix(8, grid.size - 8, true);

  // Reserve the format areas so data placement steps over them; what goes in
  // them depends on the mask, which is not chosen yet.
  for (let i = 0; i < 9; i += 1) {
    if (!grid.isFixed(i, 8)) grid.fix(i, 8, false);
    if (!grid.isFixed(8, i)) grid.fix(8, i, false);
  }
  for (let i = 0; i < 8; i += 1) {
    if (!grid.isFixed(grid.size - 1 - i, 8)) grid.fix(grid.size - 1 - i, 8, false);
    if (!grid.isFixed(8, grid.size - 1 - i)) grid.fix(8, grid.size - 1 - i, false);
  }

  if (version >= 7) {
    for (let i = 0; i < 18; i += 1) {
      const a = grid.size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      grid.fix(a, b, false);
      grid.fix(b, a, false);
    }
  }
}

/**
 * Place the codewords: two columns at a time, right to left, snaking up then
 * down, stepping over anything already drawn — and over the vertical timing
 * column entirely, which is why column 6 shifts left by one.
 */
function placeData(grid: Grid, codewords: number[]): void {
  let bit = 0;
  const total = codewords.length * 8;

  let upward = true;
  for (let right = grid.size - 1; right >= 1; right -= 2) {
    const column = right === 6 ? right - 1 : right;
    for (let step = 0; step < grid.size; step += 1) {
      const y = upward ? grid.size - 1 - step : step;
      for (const x of [column, column - 1]) {
        if (grid.isFixed(x, y)) continue;
        // Past the end of the data the remainder bits stay light.
        const byte = codewords[bit >> 3] ?? 0;
        grid.put(x, y, bit < total && ((byte >>> (7 - (bit % 8))) & 1) === 1);
        bit += 1;
      }
    }
    upward = !upward;
  }
}

const MASKS: ((x: number, y: number) => boolean)[] = [
  (x, y) => (y + x) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (y + x) % 3 === 0,
  (x, y) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0,
  (x, y) => ((y * x) % 2) + ((y * x) % 3) === 0,
  (x, y) => (((y * x) % 2) + ((y * x) % 3)) % 2 === 0,
  (x, y) => (((y + x) % 2) + ((y * x) % 3)) % 2 === 0,
];

/**
 * The four penalties the standard defines, all of them punishing a symbol
 * that looks like something it is not: long runs, solid blocks, anything
 * resembling a finder pattern, and an overall bias to dark or light.
 */
function penalty(grid: Grid): number {
  const size = grid.size;
  let score = 0;
  let dark = 0;

  const FINDER = [true, false, true, true, true, false, true, false, false, false, false];
  const REVERSED = [...FINDER].reverse();

  const line = (i: number, horizontal: boolean): boolean[] =>
    Array.from({ length: size }, (_, j) => (horizontal ? grid.get(j, i) : grid.get(i, j)));

  const matches = (values: boolean[], at: number, pattern: boolean[]): boolean =>
    pattern.every((v, k) => values[at + k] === v);

  for (let i = 0; i < size; i += 1) {
    for (const values of [line(i, true), line(i, false)]) {
      let run = 1;
      for (let j = 1; j < size; j += 1) {
        if (values[j] === values[j - 1]) {
          run += 1;
        } else {
          if (run >= 5) score += 3 + (run - 5);
          run = 1;
        }
      }
      if (run >= 5) score += 3 + (run - 5);

      for (let at = 0; at + 11 <= size; at += 1) {
        if (matches(values, at, FINDER)) score += 40;
        if (matches(values, at, REVERSED)) score += 40;
      }
    }
  }

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (grid.get(x, y)) dark += 1;
      if (x + 1 >= size || y + 1 >= size) continue;
      const first = grid.get(x, y);
      if (
        grid.get(x + 1, y) === first &&
        grid.get(x, y + 1) === first &&
        grid.get(x + 1, y + 1) === first
      ) {
        score += 3;
      }
    }
  }

  const percent = (dark * 100) / (size * size);
  return score + Math.floor(Math.abs(percent - 50) / 5) * 10;
}

/** BCH(15,5) over the five bits of level and mask, then the standard's mask. */
function formatBits(mask: number): number {
  const LEVEL_M = 0b00;
  const data = (LEVEL_M << 3) | mask;
  let value = data << 10;
  for (let i = 14; i >= 10; i -= 1) {
    if ((value >>> i) & 1) value ^= 0b10100110111 << (i - 10);
  }
  return ((data << 10) | value) ^ 0b101010000010010;
}

/** BCH(18,6) over the version number. Only versions 7 and up carry it. */
function versionBits(version: number): number {
  let value = version << 12;
  for (let i = 17; i >= 12; i -= 1) {
    if ((value >>> i) & 1) value ^= 0b1111100100101 << (i - 12);
  }
  return (version << 12) | value;
}

function drawFormat(grid: Grid, mask: number): void {
  const bits = formatBits(mask);
  const bit = (i: number): boolean => ((bits >>> i) & 1) === 1;

  // Two copies, in the order the standard lays them out: down the left of the
  // top-left finder and along the top of it, then again along row 8 on the
  // right and down column 8 at the bottom. The second copy is why a torn
  // corner still tells a scanner the level and the mask. Neither ever lands
  // on row or column 6 — that is the timing pattern.
  for (let i = 0; i <= 5; i += 1) grid.put(8, i, bit(i));
  grid.put(8, 7, bit(6));
  grid.put(8, 8, bit(7));
  grid.put(7, 8, bit(8));
  for (let i = 9; i < 15; i += 1) grid.put(14 - i, 8, bit(i));

  for (let i = 0; i < 8; i += 1) grid.put(grid.size - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i += 1) grid.put(8, grid.size - 15 + i, bit(i));
}

function drawVersion(grid: Grid, version: number): void {
  if (version < 7) return;
  const bits = versionBits(version);
  for (let i = 0; i < 18; i += 1) {
    const dark = ((bits >>> i) & 1) === 1;
    const a = grid.size - 11 + (i % 3);
    const b = Math.floor(i / 3);
    grid.put(a, b, dark);
    grid.put(b, a, dark);
  }
}

/** Build the symbol for a string: encode, protect, place, mask, mark. */
export function encodeQr(text: string): QrCode {
  const bytes = new TextEncoder().encode(text);
  const version = pickVersion(bytes.length);
  const codewords = interleave(encodeData(bytes, version), version);

  let best: { grid: Grid; score: number } | null = null;

  for (let mask = 0; mask < 8; mask += 1) {
    const grid = new Grid(version);
    drawFunctionPatterns(grid, version);
    placeData(grid, codewords);

    const pattern = MASKS[mask];
    if (!pattern) continue;
    for (let y = 0; y < grid.size; y += 1) {
      for (let x = 0; x < grid.size; x += 1) {
        if (!grid.isFixed(x, y) && pattern(x, y)) grid.flip(x, y);
      }
    }

    drawFormat(grid, mask);
    drawVersion(grid, version);

    const score = penalty(grid);
    if (!best || score < best.score) best = { grid, score };
  }

  if (!best) throw new Error('no mask produced a symbol');
  return { size: best.grid.size, modules: best.grid.toModules(), version };
}

export interface QrSvgOptions {
  /** the drawn width in pixels, quiet zone included */
  width?: number;
  /** modules of empty space around the symbol; four is the specified minimum */
  margin?: number;
}

/**
 * The symbol as an SVG string.
 *
 * Always black on white, whatever the page around it is doing. A QR inverted
 * for dark mode is a QR that a good number of phone cameras refuse to read,
 * and this one stands between a camera and somebody's money.
 */
export function qrSvg(text: string, options: QrSvgOptions = {}): string {
  const { width = 240, margin = 4 } = options;
  const code = encodeQr(text);
  const span = code.size + margin * 2;

  let path = '';
  for (let y = 0; y < code.size; y += 1) {
    const row = code.modules[y] ?? [];
    for (let x = 0; x < code.size; x += 1) {
      if (row[x]) path += `M${x + margin} ${y + margin}h1v1h-1z`;
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${width}" `,
    `viewBox="0 0 ${span} ${span}" shape-rendering="crispEdges" role="img">`,
    `<rect width="${span}" height="${span}" fill="#ffffff"/>`,
    `<path d="${path}" fill="#000000"/>`,
    '</svg>',
  ].join('');
}
