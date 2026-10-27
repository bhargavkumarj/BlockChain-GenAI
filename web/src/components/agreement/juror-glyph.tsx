import type { JurorId } from "@/lib/schemas";

/**
 * Abstract portraits for the three jurors. Each philosophy gets its own geometry: the Textualist reads lines,
 * the Equitist balances, the Pragmatist measures against a grid.
 */
export function JurorGlyph({ id, size = 56, active = false }: { id: JurorId | string; size?: number; active?: boolean }) {
  const stroke = active ? "var(--seal)" : "currentColor";
  return (
    <svg viewBox="0 0 56 56" width={size} height={size} aria-hidden className={active ? "text-seal" : undefined}>
      <rect x="0.5" y="0.5" width="55" height="55" fill="none" stroke="currentColor" strokeOpacity="0.35" />
      {id === "textualist" && (
        <g stroke={stroke} strokeWidth="1.4">
          {[14, 20, 26, 32, 38, 44].map((y, i) => (
            <line key={y} x1="10" x2={i % 3 === 2 ? 34 : 46} y1={y} y2={y} />
          ))}
          <line x1="8" x2="8" y1="10" y2="46" strokeWidth="2.4" />
        </g>
      )}
      {id === "equitist" && (
        <g stroke={stroke} strokeWidth="1.4" fill="none">
          <line x1="28" y1="10" x2="28" y2="46" />
          <line x1="12" y1="18" x2="44" y2="18" />
          <path d="M12 18 L7 30 A5 3 0 0 0 17 30 Z" />
          <path d="M44 18 L39 30 A5 3 0 0 0 49 30 Z" />
          <line x1="20" y1="46" x2="36" y2="46" strokeWidth="2.4" />
          <circle cx="28" cy="10" r="2" fill={stroke} />
        </g>
      )}
      {id === "pragmatist" && (
        <g stroke={stroke} strokeWidth="1.1" fill="none">
          {[10, 19, 28, 37, 46].map((v) => (
            <g key={v}>
              <line x1={v} x2={v} y1="10" y2="46" strokeOpacity="0.45" />
              <line x1="10" x2="46" y1={v} y2={v} strokeOpacity="0.45" />
            </g>
          ))}
          <path d="M10 42 L19 35 L28 37 L37 22 L46 16" strokeWidth="2" />
          <circle cx="37" cy="22" r="2.4" fill={stroke} />
        </g>
      )}
    </svg>
  );
}
