import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { type AgreementView, type Filing, type MilestoneView, roleOf } from "@/lib/agreement";
import { tokenFor } from "@/lib/config";
import { formatAmount, roman } from "@/lib/format";
import {
  DeliveryDocument,
  EvidenceDocument,
  type FileRef,
  TermsDocument,
} from "@/lib/schemas";
import { fence } from "@/lib/tribunal-math";
import { readFilings } from "./chain";
import { fetchCID, fetchJSON } from "./ipfs";

type Block = Anthropic.Beta.BetaContentBlockParam;

export type CaseFiling = Filing & { role: "client" | "provider" | "viewer"; doc: EvidenceDocument | null };

export type CaseFile = {
  agreement: AgreementView;
  milestone: MilestoneView;
  terms: TermsDocument | null;
  delivery: DeliveryDocument | null;
  filings: CaseFiling[];
  blocks: Block[];
  text: string;
};

const TEXT_LIMIT = 24_000;
const IMAGE_LIMIT = 3_500_000;
const MAX_ATTACHMENTS = 5;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

export async function loadTerms(cid: string) {
  try {
    return TermsDocument.parse(await fetchJSON(cid));
  } catch {
    return null;
  }
}

export async function loadDelivery(cid: string) {
  if (!cid) return null;
  try {
    return DeliveryDocument.parse(await fetchJSON(cid));
  } catch {
    return null;
  }
}

async function loadEvidence(cid: string) {
  try {
    return EvidenceDocument.parse(await fetchJSON(cid));
  } catch {
    return null;
  }
}

/**
 * Builds the tribunal's record for one milestone: agreement terms, on-chain timeline, the delivery with its
 * files inlined (text) or attached (images, PDFs), and every filing. Party-written text is fenced and any
 * attempt to forge the record's own tags is neutralised.
 */
export async function buildCaseFile(
  a: AgreementView,
  index: number,
  opts: { includeFilings?: boolean } = {},
): Promise<CaseFile> {
  const milestone = a.milestones[index];
  if (!milestone) throw new Error("Unknown milestone");
  const includeFilings = opts.includeFilings ?? true;

  const [terms, delivery, rawFilings] = await Promise.all([
    loadTerms(a.termsCID),
    loadDelivery(milestone.deliveryCID),
    includeFilings ? readFilings(a.id, index) : Promise.resolve([] as Filing[]),
  ]);
  const filings: CaseFiling[] = await Promise.all(
    rawFilings.map(async (f) => ({ ...f, role: roleOf(a, f.by), doc: await loadEvidence(f.cid) })),
  );

  const token = tokenFor(a.token);
  const amount = (v: bigint) => `${formatAmount(v, token.decimals, 6)} ${token.symbol}`;
  const iso = (t: number) => (t ? new Date(t * 1000).toISOString() : "—");
  const attachments: Block[] = [];
  let attachmentCount = 0;

  async function renderFiles(files: FileRef[], source: string) {
    const parts: string[] = [];
    for (const f of files) {
      const header = `<file name="${attr(f.name)}" type="${attr(f.mediaType)}" cid="${attr(f.cid)}" bytes="${f.size}"`;
      try {
        if (isTextual(f.mediaType)) {
          const { bytes } = await fetchCID(f.cid);
          let body = new TextDecoder().decode(bytes);
          const truncated = body.length > TEXT_LIMIT;
          if (truncated) body = body.slice(0, TEXT_LIMIT);
          parts.push(`${header}${truncated ? ' truncated="true"' : ""}>\n${fence(body)}\n</file>`);
        } else if ((IMAGE_TYPES.has(f.mediaType) || f.mediaType === "application/pdf") && attachmentCount < MAX_ATTACHMENTS) {
          const { bytes } = await fetchCID(f.cid);
          if (bytes.byteLength > IMAGE_LIMIT) {
            parts.push(`${header}>[too large to attach]</file>`);
            continue;
          }
          attachmentCount += 1;
          const label = `Attachment ${attachmentCount}: ${f.name} (${source})`;
          const data = Buffer.from(bytes).toString("base64");
          attachments.push({ type: "text", text: label });
          attachments.push(
            f.mediaType === "application/pdf"
              ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
              : {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: f.mediaType as "image/png" | "image/jpeg" | "image/gif" | "image/webp",
                    data,
                  },
                },
          );
          parts.push(`${header}>[see ${label}]</file>`);
        } else {
          parts.push(`${header}>[binary file, not inspectable]</file>`);
        }
      } catch {
        parts.push(`${header}>[could not be retrieved from IPFS]</file>`);
      }
    }
    return parts.join("\n");
  }

  const draft = terms?.draft;
  const lines: string[] = ["<record>"];
  lines.push(
    `<agreement id="${a.id}" title="${attr(draft?.title ?? "Untitled")}" total="${amount(a.total)}" terms_cid="${a.termsCID}">`,
  );
  if (draft) {
    lines.push(`<summary>${fence(draft.summary)}</summary>`);
    lines.push(
      `<parties client="${a.client} (${attr(draft.clientLabel)})" provider="${a.provider} (${attr(draft.providerLabel)})" proposed_by="client" />`,
    );
    lines.push("<milestones>");
    draft.milestones.forEach((m, i) => {
      const onchain = a.milestones[i];
      lines.push(
        `<milestone n="${roman(i + 1)}" amount="${onchain ? amount(onchain.amount) : m.amount}" due="${iso(onchain?.dueBy ?? 0)}" status="${onchain?.phase ?? "?"}"${i === index ? ' disputed="true"' : ""}>`,
      );
      lines.push(`${fence(m.title)}: ${fence(m.description)}`);
      lines.push(`Deliverables:\n${m.deliverables.map((d) => `- ${fence(d)}`).join("\n")}`);
      lines.push(`Acceptance criteria:\n${m.acceptanceCriteria.map((c, k) => `${k + 1}. ${fence(c)}`).join("\n")}`);
      lines.push("</milestone>");
    });
    lines.push("</milestones>");
    lines.push(`<clauses>\n${draft.clauses.map((c, i) => `§ ${i + 1} ${fence(c.heading)}: ${fence(c.body)}`).join("\n")}\n</clauses>`);
  } else {
    lines.push("<terms>The terms document could not be retrieved from IPFS.</terms>");
  }
  lines.push("</agreement>");

  const events: [number, string][] = [[a.createdAt, `Agreement created and ${amount(a.total)} escrowed by the client`]];
  if (a.acceptedAt) events.push([a.acceptedAt, "Provider accepted the terms"]);
  if (milestone.deliveredAt) {
    const lateness = milestone.dueBy ? milestone.deliveredAt - milestone.dueBy : 0;
    const note = milestone.dueBy
      ? lateness > 0
        ? `${Math.ceil(lateness / 3600)} hours after the due date`
        : "before the due date"
      : "no due date";
    events.push([milestone.deliveredAt, `Milestone ${roman(index + 1)} delivered (${note})`]);
  }
  if (milestone.disputedAt) {
    events.push([milestone.disputedAt, `Dispute opened by the ${roleOf(a, milestone.disputant)}`]);
  }
  filings.forEach((f, i) => events.push([f.at, `Filing ${i + 1} submitted by the ${f.role}`]));
  events.sort((x, y) => x[0] - y[0]);
  lines.push(`<timeline review_period_seconds="${a.reviewPeriod}" response_window_seconds="${a.responseWindow}">`);
  lines.push(events.map(([t, e]) => `- ${iso(t)} ${e}`).join("\n"));
  lines.push("</timeline>");

  if (delivery) {
    lines.push(`<delivery milestone="${roman(index + 1)}" submitted="${iso(milestone.deliveredAt)}">`);
    lines.push(`<note>${fence(delivery.note)}</note>`);
    if (delivery.links.length) lines.push(`<links>${delivery.links.map(fence).join(" ")}</links>`);
    lines.push(await renderFiles(delivery.files, "delivery"));
    lines.push("</delivery>");
  } else {
    lines.push(`<delivery milestone="${roman(index + 1)}">Nothing was delivered for this milestone.</delivery>`);
  }

  for (const [i, f] of filings.entries()) {
    lines.push(`<filing n="${i + 1}" party="${f.role}" filed="${iso(f.at)}">`);
    if (f.doc) {
      lines.push(`<statement>${fence(f.doc.statement)}</statement>`);
      if (f.doc.files.length) lines.push(await renderFiles(f.doc.files, `filing ${i + 1}`));
    } else {
      lines.push("[filing document unavailable]");
    }
    lines.push("</filing>");
  }
  lines.push("</record>");

  const text = lines.join("\n");
  return { agreement: a, milestone, terms, delivery, filings, text, blocks: [{ type: "text", text }, ...attachments] };
}

function isTextual(mediaType: string) {
  return (
    mediaType.startsWith("text/") ||
    mediaType === "image/svg+xml" ||
    mediaType === "application/json" ||
    mediaType === "application/xml"
  );
}


function attr(value: string) {
  return value.replace(/["<>]/g, "'");
}
