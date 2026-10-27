import Link from "next/link";
import { CHAIN_LABEL } from "@/lib/config";
import { Brand } from "./brand";
import { NavLinks } from "./nav-links";
import { ThemeToggle } from "./theme-toggle";

export const NAV = [
  { href: "/draft", label: "Draft" },
  { href: "/ledger", label: "Ledger" },
  { href: "/precedents", label: "Precedents" },
  { href: "/protocol", label: "Protocol" },
];

/** Shared top bar. `actions` holds the right-hand controls (wallet in the app, a CTA on the landing page). */
export function Header({ actions }: { actions?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-40 border-b border-rule bg-paper/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1320px] items-center gap-6 px-4 sm:px-6">
        <Brand />
        <NavLinks items={NAV} />
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <span className="hidden items-center gap-2 font-mono text-[0.68rem] uppercase tracking-[0.08em] text-ink-3 lg:inline-flex">
            <span className="pulse-dot size-1.5 rounded-full bg-ledger" aria-hidden />
            {CHAIN_LABEL}
          </span>
          <ThemeToggle />
          {actions ?? (
            <Link href="/draft" className="btn btn-ink btn-sm">
              Open app
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
