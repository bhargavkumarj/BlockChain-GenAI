// A local stand-in for the Claude Messages API, for exercising Pactum's *live* AI path without credentials.
//
//   node e2e/mock-anthropic.mjs            # listens on :4010
//   ANTHROPIC_BASE_URL=http://127.0.0.1:4010 ANTHROPIC_API_KEY=sk-mock AI_SIMULATE=0 pnpm start
//   OPENROUTER_BASE_URL=http://127.0.0.1:4010/api OPENROUTER_API_KEY=sk-or-mock pnpm start   # OpenRouter path
//
// It streams genuine SSE events (a thinking block, then text deltas), checks each request has the shape the
// app promises (model, fallback beta, structured-output schema; on the OpenRouter path bearer auth, an
// OpenRouter model slug and no Anthropic-only fields), and answers per agent based on the system prompt.
// Every request is logged so the request contract can be inspected.
import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_PORT ?? 4010);
const problems = [];

const answers = {
  scribe: () => ({
    title: "Taglines and About page for Crux climbing gym",
    summary: "The writer delivers five tagline options and a 150-word About page for Crux, an indoor climbing gym.",
    category: "writing",
    clientLabel: "Crux Climbing",
    providerLabel: "Copywriter",
    currency: "tUSD",
    milestones: [
      {
        title: "Tagline options",
        description: "Five distinct tagline options with a one-line rationale each.",
        amount: 50,
        dueInDays: 2,
        deliverables: ["taglines.md with five options and rationales"],
        acceptanceCriteria: ["Exactly five taglines", "Each tagline is 8 words or fewer", "Each has a one-sentence rationale"],
      },
      {
        title: "About page",
        description: "A 150-word About page in the brand's voice.",
        amount: 70,
        dueInDays: 3,
        deliverables: ["about.md"],
        acceptanceCriteria: ["Between 135 and 165 words", "Mentions bouldering and the beginner programme", "No placeholder text"],
      },
    ],
    clauses: [
      { heading: "Revisions", body: "One round of revisions per milestone, requested within the review period." },
      { heading: "Ownership & licence", body: "All rights transfer to the client on payment of each milestone." },
      { heading: "Communication", body: "Replies within one business day by email." },
      { heading: "Late delivery", body: "The client may reclaim a milestone not delivered by its due date." },
      { heading: "Cancellation", body: "Either party may withdraw before acceptance; afterwards milestones settle by agreement or ruling." },
    ],
    clarity: {
      score: 88,
      issues: [{ severity: "low", clause: "Milestone II", issue: "Brand voice is not described.", suggestion: "Attach two paragraphs the client likes." }],
    },
  }),
  inspector: () => ({
    verdict: "partially_meets",
    summary: "Four taglines were delivered instead of five; the rest of the criteria are met.",
    criteria: [
      { criterion: "Exactly five taglines", assessment: "not_met", reasoning: "taglines.md lists four options." },
      { criterion: "Each tagline is 8 words or fewer", assessment: "met", reasoning: "Longest option has seven words." },
      { criterion: "Each has a one-sentence rationale", assessment: "met", reasoning: "Every option has a rationale line." },
    ],
    suggestions: ["Ask for the fifth tagline before approving."],
  }),
  juror: (system) => {
    const share = system.includes("Textualist") ? 60 : system.includes("Equitist") ? 75 : 80;
    return {
      holding: `The provider earns ${share}% of the milestone.`,
      findings: ["Four of five required taglines were delivered.", "The delivery was on time."],
      criteria: [
        { criterion: "Exactly five taglines", assessment: "not_met", reasoning: "Four were delivered." },
        { criterion: "Each tagline is 8 words or fewer", assessment: "met", reasoning: "All are short." },
        { criterion: "Each has a one-sentence rationale", assessment: "met", reasoning: "Present for each." },
      ],
      analysis: "The core of the work was delivered on time, but one required option is missing, so a proportionate reduction applies.",
      providerSharePercent: share,
      confidence: 80,
      integrityFlags: [],
    };
  },
  opinion: () => ({
    title: "On the tagline options of Milestone I",
    holding: "The tribunal awards 75% of the milestone to the provider.",
    reasoning: "All three jurors found the delivery timely and substantially complete, with one of five taglines missing.",
    remedy: "75% is released to the provider (less the protocol fee) and 25% refunded to the client.",
    guidance: "Confirm counts explicitly before submitting the next milestone.",
    dissent: "",
  }),
  decide: () => ({ accept: true, reason: "Both milestones are text deliverables I can produce to the stated criteria." }),
  deliver: () => ({
    coverNote: "Criterion 1: taglines.md. Criterion 2: every line under eight words. Criterion 3: rationale under each.",
    files: [
      {
        filename: "taglines.md",
        mediaType: "text/markdown",
        content: "# Taglines for Crux\n\n1. Climb your own line. — Personal progress.\n2. Every wall, a new story. — Variety.\n3. Grip. Breathe. Rise. — Rhythm of a climb.\n4. Where problems are the point. — Bouldering humour.\n",
      },
      {
        filename: "mark.svg",
        mediaType: "image/svg+xml",
        content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M8 56 L32 8 L56 56 Z" fill="none" stroke="#15130f" stroke-width="4"/></svg>',
      },
    ],
  }),
  defend: () => ({
    statement: "I delivered four strong taglines on time and met the length and rationale criteria. I accept that one option was missing.",
    proposedSharePercent: 80,
  }),
};

function route(system) {
  if (system.includes("You are Scribe")) return "scribe";
  if (system.includes("delivery inspector")) return "inspector";
  if (system.includes("You sit as")) return "juror";
  if (system.includes("writing the opinion of the tribunal")) return "opinion";
  if (system.includes("Decide whether to accept")) return "decide";
  if (system.includes("Produce the deliverables")) return "deliver";
  if (system.includes("The client has disputed your delivery")) return "defend";
  if (system.includes("Clerk of Pactum")) return "clerk";
  return "unknown";
}

function check(kind, req, body, openRouter) {
  const issues = [];
  if (!body.model) issues.push("missing model");
  if (openRouter) {
    if (!req.headers.authorization?.startsWith("Bearer ")) issues.push("missing bearer token");
    if (!body.model?.startsWith("anthropic/")) issues.push(`model ${body.model} is not an OpenRouter slug`);
    if (body.fallbacks !== undefined || req.headers["anthropic-beta"]?.includes("server-side-fallback")) {
      issues.push("sends Anthropic-only fallback fields");
    }
  } else {
    if (!req.headers["anthropic-beta"]?.includes("server-side-fallback-2026-07-01")) issues.push("missing fallback beta header");
    if (body.fallbacks !== "default") issues.push("fallbacks is not 'default'");
  }
  if (!body.stream) issues.push("not streaming");
  if (body.temperature !== undefined) issues.push("sends temperature");
  const format = body.output_config?.format;
  if (kind === "clerk") {
    if (format) issues.push("clerk should not use structured output");
    if (!body.cache_control) issues.push("clerk should enable prompt caching");
  } else if (kind !== "unknown") {
    if (format?.type !== "json_schema" || typeof format.schema !== "object") issues.push("missing json_schema output format");
    if (format?.schema && format.schema.additionalProperties !== false) issues.push("schema root allows additional properties");
  }
  if (issues.length) problems.push({ kind, issues });
  return issues;
}

function sse(res, events) {
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", "request-id": "req_mock" });
  for (const [event, data] of events) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  res.end();
}

const server = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/__problems") {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify(problems));
  }
  const openRouter = req.url?.startsWith("/api/v1/messages");
  if (req.method !== "POST" || !(openRouter || req.url?.startsWith("/v1/messages"))) {
    res.writeHead(404);
    return res.end();
  }
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const body = JSON.parse(raw);
    const system = typeof body.system === "string" ? body.system : (body.system ?? []).map((b) => b.text).join("\n");
    const kind = route(system);
    const issues = check(kind, req, body, openRouter);
    const text =
      kind === "clerk"
        ? "Under § 1 (Revisions) you get one round of revisions per milestone, requested within the review period."
        : JSON.stringify((answers[kind] ?? (() => ({})))(system));
    console.log(
      `${new Date().toISOString().slice(11, 19)} ${kind.padEnd(9)} model=${body.model} effort=${body.output_config?.effort} ` +
        `${openRouter ? "via=openrouter " : ""}beta=${req.headers["anthropic-beta"]} schema=${Boolean(body.output_config?.format)} ${issues.length ? `⚠ ${issues.join("; ")}` : "ok"}`,
    );

    const chunks = text.match(/[\s\S]{1,40}/g) ?? [];
    sse(res, [
      ["message_start", { type: "message_start", message: { id: "msg_mock", type: "message", role: "assistant", model: body.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1200, output_tokens: 1 } } }],
      ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "", signature: "" } }],
      ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: "c2lnbmF0dXJl" } }],
      ["content_block_stop", { type: "content_block_stop", index: 0 }],
      ["content_block_start", { type: "content_block_start", index: 1, content_block: { type: "text", text: "" } }],
      ...chunks.map((t) => ["content_block_delta", { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: t } }]),
      ["content_block_stop", { type: "content_block_stop", index: 1 }],
      ["message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: chunks.length * 10 } }],
      ["message_stop", { type: "message_stop" }],
    ]);
  });
});

server.listen(PORT, () => console.log(`mock Messages API on http://127.0.0.1:${PORT}`));
