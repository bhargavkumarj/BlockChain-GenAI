import { useId } from "react";
import { petalCircles, scallopPath, sealGeometry, starPath, tickLines } from "@/lib/seal";
import { roman } from "@/lib/format";

type SealProps = {
  /** Anything stable and unique: agreement id + terms CID works well. */
  seed: string;
  /** Agreement number shown at the centre (Roman numerals). */
  number?: number;
  legend?: string;
  size?: number;
  className?: string;
  animate?: boolean;
  /** Draws the seal as a faint, uninked outline (e.g. before sealing). */
  ghost?: boolean;
};

/**
 * A generative wax-and-ink seal. Every agreement gets a unique one derived from its seed. Rendered as
 * plain SVG (no client JS) with a turbulence filter that roughens edges and knocks out speckles of ink.
 */
export function Seal({ seed, number, legend, size = 160, className = "", animate = false, ghost = false }: SealProps) {
  const uid = useId().replace(/[:«»]/g, "");
  const g = sealGeometry(seed);
  const c = 100;
  const textRadius = 77;
  const numeral = number ? roman(number) : "P";
  const text = legend ?? `Pactum · Agreement ${number ? roman(number) : "—"} · Pacta sunt servanda · `;
  const ticks = tickLines(c, c, 61, 66, g.ticks, g.majorEvery);
  const petals = petalCircles(c, c, g.petals, g.petalOffset, g.petalRadius, g.rotation);
  const numeralSize = numeral.length <= 3 ? 19 : numeral.length <= 6 ? 14 : 10;

  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      role="img"
      aria-label={`Seal of agreement ${number ?? ""}`.trim()}
      className={`${animate ? "animate-stamp" : ""} ${className}`}
      style={animate ? undefined : { transform: "rotate(-10deg)" }}
    >
      <defs>
        <filter id={`ink-${uid}`} x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed={g.petals} result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale={ghost ? 0 : 1.6} result="rough" />
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="3" seed={g.ticks} result="blotch" />
          <feColorMatrix
            in="blotch"
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -3.2 3.25"
            result="mask"
          />
          <feComposite in="rough" in2="mask" operator="in" />
        </filter>
        <path id={`ring-${uid}`} d={`M ${c} ${c} m -${textRadius} 0 a ${textRadius} ${textRadius} 0 1 1 ${textRadius * 2} 0 a ${textRadius} ${textRadius} 0 1 1 -${textRadius * 2} 0`} />
      </defs>

      <g
        filter={ghost ? undefined : `url(#ink-${uid})`}
        fill="none"
        stroke="currentColor"
        opacity={ghost ? 0.28 : 1}
        strokeDasharray={ghost ? "2 3" : undefined}
      >
        <path d={scallopPath(c, c, 95, g.scallops, g.scallopDepth)} strokeWidth={3.2} />
        <circle cx={c} cy={c} r={88} strokeWidth={1.5} />
        <circle cx={c} cy={c} r={68} strokeWidth={2} />
        {ticks.map((t, i) => (
          <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} strokeWidth={t.major ? 2 : 1.1} />
        ))}
        <circle cx={c} cy={c} r={55} strokeWidth={1.2} />
        {petals.map((p, i) => (
          <circle key={i} cx={p.cx} cy={p.cy} r={p.r} strokeWidth={1} />
        ))}
        <path d={starPath(c, c, 50, g.petals, g.starStep, g.rotation)} strokeWidth={1.3} strokeLinejoin="round" />
        {Array.from({ length: g.innerRings }, (_, i) => (
          <circle key={i} cx={c} cy={c} r={27 + i * 3.5} strokeWidth={1.3} />
        ))}
        <circle cx={c} cy={c} r={23} fill={ghost ? "none" : "currentColor"} strokeWidth={1} />
        <text
          fontFamily="var(--font-mono)"
          fontSize="9"
          letterSpacing="0.6"
          fontWeight={500}
          fill="currentColor"
          stroke="none"
          style={{ textTransform: "uppercase" }}
        >
          <textPath href={`#ring-${uid}`} textLength={Math.round(2 * Math.PI * textRadius - 4)} lengthAdjust="spacing">
            {text.toUpperCase()}
          </textPath>
        </text>
        <text
          x={c}
          y={c}
          textAnchor="middle"
          dominantBaseline="central"
          fontFamily="var(--font-serif)"
          fontSize={numeralSize}
          fill={ghost ? "currentColor" : "var(--sheet)"}
          stroke="none"
        >
          {numeral}
        </text>
      </g>
    </svg>
  );
}
