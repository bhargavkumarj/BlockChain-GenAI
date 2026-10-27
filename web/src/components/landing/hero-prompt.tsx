"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const EXAMPLES = [
  "A logo for my bakery: three concepts, then a final SVG. 400 tUSD, two weeks.",
  "Translate my 2,000-word landing page into Spanish. 90 tUSD within a week.",
  "Five tagline options for a climbing gym. 60 tUSD, three days.",
  "Fix the checkout bug on my Shopify store and add a regression test. 250 tUSD.",
];

/** The hero is the product: type a deal, press enter, and Scribe starts drafting on the next page. */
export function HeroPrompt() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [example, setExample] = useState(0);
  const [typed, setTyped] = useState("");

  // Typewriter placeholder cycling through example deals.
  useEffect(() => {
    if (value) return;
    const target = EXAMPLES[example]!;
    if (typed.length < target.length) {
      const t = setTimeout(() => setTyped(target.slice(0, typed.length + 1)), 28);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      setTyped("");
      setExample((e) => (e + 1) % EXAMPLES.length);
    }, 2400);
    return () => clearTimeout(t);
  }, [typed, example, value]);

  function submit() {
    const deal = (value || EXAMPLES[example]!).trim();
    router.push(`/draft?q=${encodeURIComponent(deal)}`);
  }

  return (
    <form
      className="group relative mt-10 border border-ink bg-sheet shadow-[6px_6px_0_0_var(--ink)] transition-shadow focus-within:shadow-[6px_6px_0_0_var(--seal)]"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label htmlFor="hero-deal" className="label block px-5 pt-4">
        Describe a deal
      </label>
      <div className="flex flex-col gap-3 px-5 pb-4 pt-1 sm:flex-row sm:items-end">
        <textarea
          id="hero-deal"
          rows={2}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={typed}
          className="min-h-[3.5rem] flex-1 resize-none bg-transparent font-serif text-[1.45rem] leading-snug outline-none placeholder:text-ink-4"
        />
        <button className="btn btn-seal shrink-0">Draft it →</button>
      </div>
    </form>
  );
}
