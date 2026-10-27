import Link from "next/link";

/** The Pactum mark: a stamped "P" inside a scalloped seal ring. */
export function Mark({ size = 26, className = "" }: { size?: number; className?: string }) {
  const bumps = 18;
  const points = Array.from({ length: bumps * 6 + 1 }, (_, i) => {
    const t = (i / (bumps * 6)) * Math.PI * 2;
    const r = 15 + 0.9 * Math.cos(bumps * t);
    return `${(16 + r * Math.cos(t)).toFixed(2)},${(16 + r * Math.sin(t)).toFixed(2)}`;
  }).join(" ");
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={className} aria-hidden>
      <polygon points={points} fill="var(--seal)" />
      <circle cx="16" cy="16" r="11.2" fill="none" stroke="var(--sheet)" strokeWidth="0.9" />
      <text
        x="16"
        y="16.5"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="var(--font-serif)"
        fontStyle="italic"
        fontSize="17"
        fill="var(--sheet)"
      >
        P
      </text>
    </svg>
  );
}

export function Brand() {
  return (
    <Link href="/" className="group flex items-center gap-2.5" aria-label="Pactum home">
      <Mark className="transition-transform duration-500 group-hover:rotate-[-24deg]" />
      <span className="font-serif text-[1.65rem] leading-none tracking-tight">Pactum</span>
    </Link>
  );
}
