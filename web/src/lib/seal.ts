import { hexToBytes, keccak256, toHex } from "viem";

/**
 * Deterministic geometry for an agreement's seal. The same seed (agreement id + terms CID) always yields
 * the same stamp, so the seal doubles as a visual fingerprint: change one byte of the terms and it changes.
 */
export type SealGeometry = {
  scallops: number;
  scallopDepth: number;
  ticks: number;
  majorEvery: number;
  petals: number;
  petalRadius: number;
  petalOffset: number;
  starStep: number;
  rotation: number;
  innerRings: number;
};

export function sealGeometry(seed: string): SealGeometry {
  const b = hexToBytes(keccak256(toHex(seed)));
  const at = (i: number) => b[i % b.length]!;
  const petals = 5 + (at(3) % 8); // 5..12
  return {
    scallops: 28 + (at(0) % 5) * 4, // 28..44
    scallopDepth: 1.1 + (at(1) % 10) / 10, // 1.1..2.0
    ticks: 36 + (at(2) % 4) * 12, // 36..72
    majorEvery: [3, 4, 6][at(4) % 3]!,
    petals,
    petalRadius: 15 + (at(5) % 9), // 15..23
    petalOffset: 14 + (at(6) % 8), // 14..21
    starStep: petals > 6 ? 2 + (at(7) % Math.max(1, Math.floor(petals / 2) - 1)) : 2,
    rotation: (at(8) / 255) * 360,
    innerRings: 1 + (at(9) % 2),
  };
}

const TAU = Math.PI * 2;
/** Fixed precision so server- and client-rendered SVG attributes are byte-identical (no hydration drift). */
const r2 = (n: number) => Math.round(n * 100) / 100;

export function scallopPath(cx: number, cy: number, r: number, count: number, depth: number) {
  const steps = count * 8;
  let d = "";
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * TAU;
    const rr = r + depth * Math.cos(count * t);
    const x = cx + rr * Math.cos(t);
    const y = cy + rr * Math.sin(t);
    d += `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return `${d}Z`;
}

export function tickLines(cx: number, cy: number, inner: number, outer: number, count: number, majorEvery: number) {
  return Array.from({ length: count }, (_, i) => {
    const t = (i / count) * TAU - Math.PI / 2;
    const r0 = i % majorEvery === 0 ? inner - 3 : inner;
    return {
      x1: r2(cx + r0 * Math.cos(t)),
      y1: r2(cy + r0 * Math.sin(t)),
      x2: r2(cx + outer * Math.cos(t)),
      y2: r2(cy + outer * Math.sin(t)),
      major: i % majorEvery === 0,
    };
  });
}

/** Star polygon {n/step}, drawn as a single path. */
export function starPath(cx: number, cy: number, r: number, n: number, step: number, rotationDeg: number) {
  const rot = (rotationDeg * Math.PI) / 180;
  const points = Array.from({ length: n }, (_, i) => {
    const t = (i / n) * TAU + rot - Math.PI / 2;
    return [cx + r * Math.cos(t), cy + r * Math.sin(t)] as const;
  });
  let d = "";
  let i = 0;
  const visited = new Set<number>();
  // A {n/k} star with gcd(n,k) > 1 is several polygons; trace each cycle.
  for (let start = 0; start < n; start++) {
    if (visited.has(start)) continue;
    i = start;
    d += `M${points[i]![0].toFixed(2)} ${points[i]![1].toFixed(2)}`;
    do {
      visited.add(i);
      i = (i + step) % n;
      d += `L${points[i]![0].toFixed(2)} ${points[i]![1].toFixed(2)}`;
    } while (i !== start);
    d += "Z";
  }
  return d;
}

export function petalCircles(cx: number, cy: number, n: number, offset: number, radius: number, rotationDeg: number) {
  const rot = (rotationDeg * Math.PI) / 180;
  return Array.from({ length: n }, (_, i) => {
    const t = (i / n) * TAU + rot;
    return { cx: r2(cx + offset * Math.cos(t)), cy: r2(cy + offset * Math.sin(t)), r: radius };
  });
}
