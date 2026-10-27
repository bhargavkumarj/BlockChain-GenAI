"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export function NavLinks({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const active = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  return (
    <>
      <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`relative px-3 py-2 text-[0.92rem] transition-colors ${
              active(item.href) ? "text-ink" : "text-ink-3 hover:text-ink"
            }`}
          >
            {item.label}
            {active(item.href) && <span className="absolute inset-x-3 -bottom-[13px] h-px bg-ink" aria-hidden />}
          </Link>
        ))}
      </nav>
      <button
        type="button"
        className="order-last grid size-9 place-items-center md:hidden"
        aria-label="Menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="flex w-5 flex-col gap-1.5" aria-hidden>
          <span className={`h-px bg-ink transition-transform ${open ? "translate-y-[3.5px] rotate-45" : ""}`} />
          <span className={`h-px bg-ink transition-transform ${open ? "-translate-y-[3.5px] -rotate-45" : ""}`} />
        </span>
      </button>
      {open && (
        <nav
          className="fixed inset-x-0 top-16 z-40 border-b border-rule bg-paper px-4 pb-6 pt-2 md:hidden"
          aria-label="Mobile"
        >
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="flex items-center justify-between border-b border-rule py-4 font-serif text-3xl"
            >
              {item.label}
              <span className="font-mono text-sm text-ink-4">→</span>
            </Link>
          ))}
        </nav>
      )}
    </>
  );
}
