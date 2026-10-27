import { formatUnits, parseUnits } from "viem";

export function shortAddress(addr?: string, size = 4) {
  if (!addr) return "—";
  return `${addr.slice(0, 2 + size)}…${addr.slice(-size)}`;
}

export function formatAmount(value: bigint, decimals: number, maxFraction = 2) {
  const [whole, fraction = ""] = formatUnits(value, decimals).split(".");
  const grouped = BigInt(whole!).toLocaleString("en-US");
  const trimmed = fraction.slice(0, maxFraction).replace(/0+$/, "");
  return trimmed ? `${grouped}.${trimmed}` : grouped;
}

export function toUnits(value: number | string, decimals: number) {
  const str = typeof value === "number" ? value.toFixed(Math.min(decimals, 6)) : value;
  return parseUnits(str, decimals);
}

const ROMAN: [number, string][] = [
  [1000, "M"],
  [900, "CM"],
  [500, "D"],
  [400, "CD"],
  [100, "C"],
  [90, "XC"],
  [50, "L"],
  [40, "XL"],
  [10, "X"],
  [9, "IX"],
  [5, "V"],
  [4, "IV"],
  [1, "I"],
];

/** Agreement numbers are set in Roman numerals, like clauses and volumes. Falls back to digits past 3999. */
export function roman(n: number) {
  if (!Number.isInteger(n) || n <= 0 || n >= 4000) return String(n);
  let out = "";
  for (const [value, glyph] of ROMAN) {
    while (n >= value) {
      out += glyph;
      n -= value;
    }
  }
  return out;
}

export function agreementNumber(id: number | bigint) {
  return `№ ${String(id).padStart(4, "0")}`;
}

export function formatDuration(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${String(sec).padStart(2, "0")}s`;
  return `${sec}s`;
}

/** Human description of a window length, e.g. 259200 → "3 days". */
export function describeWindow(seconds: number) {
  if (seconds % 86400 === 0) return plural(seconds / 86400, "day");
  if (seconds % 3600 === 0) return plural(seconds / 3600, "hour");
  if (seconds % 60 === 0) return plural(seconds / 60, "minute");
  return plural(seconds, "second");
}

function plural(n: number, unit: string) {
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}

export function formatDate(unixSeconds: number | bigint, withTime = true) {
  const date = new Date(Number(unixSeconds) * 1000);
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

export function timeAgo(unixSeconds: number | bigint, now = Date.now() / 1000) {
  const diff = now - Number(unixSeconds);
  if (diff < 45) return "just now";
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

export function percent(bps: number) {
  const value = bps / 100;
  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
}
