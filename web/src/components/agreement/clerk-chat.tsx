"use client";

import { useRef, useState } from "react";
import { Dots } from "@/components/ui";
import { useStream } from "@/hooks/use-stream";

type Message = { role: "user" | "assistant"; content: string };

const STARTERS = ["What happens if the work is late?", "How many revisions are included?", "How would a dispute work here?"];

/** The Clerk: ask anything about this agreement; answers are grounded in its terms and on-chain state. */
export function ClerkChat({ agreementId }: { agreementId: number }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const stream = useStream();
  const answer = useRef("");

  function ask(question: string) {
    const q = question.trim();
    if (!q || stream.running) return;
    const history: Message[] = [...messages, { role: "user", content: q }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setInput("");
    setError(null);
    answer.current = "";
    void stream.start("/api/ai/clerk", { agreementId, messages: history.slice(-12) }, ({ event, data }) => {
      const d = data as Record<string, unknown>;
      if (event === "delta") {
        answer.current += d.delta as string;
        const text = answer.current;
        setMessages((m) => [...m.slice(0, -1), { role: "assistant", content: text }]);
      } else if (event === "error") {
        setError(d.message as string);
        setMessages((m) => m.slice(0, -1));
      }
    });
  }

  return (
    <section className="border border-rule bg-sheet">
      <header className="border-b border-rule px-4 py-3">
        <p className="label">Ask the Clerk</p>
        <p className="mt-0.5 text-xs text-ink-3">Questions about these terms, answered from the agreement itself.</p>
      </header>
      <div className="grid max-h-[26rem] gap-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="flex flex-wrap gap-1.5">
            {STARTERS.map((s) => (
              <button
                key={s}
                className="border border-rule px-2 py-1 text-left text-xs text-ink-2 transition-colors hover:border-ink"
                onClick={() => ask(s)}
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) =>
          m.role === "user" ? (
            <p key={i} className="ml-6 justify-self-end bg-paper-2 px-3 py-2 text-sm">
              {m.content}
            </p>
          ) : (
            <p key={i} className="mr-4 whitespace-pre-line font-serif text-[1.08rem] leading-snug">
              {m.content || <Dots />}
            </p>
          ),
        )}
        {error && <p className="text-sm text-seal">{error}</p>}
      </div>
      <form
        className="flex gap-2 border-t border-rule px-4 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
      >
        <input className="field flex-1 text-sm" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about the terms…" aria-label="Question" />
        <button className="btn btn-line btn-sm" disabled={stream.running || !input.trim()}>
          Ask
        </button>
      </form>
    </section>
  );
}
