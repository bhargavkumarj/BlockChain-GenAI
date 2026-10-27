"use client";

import { Allow, parse } from "partial-json";
import { useRef, useState } from "react";
import { AddressTag, Dots, Notice } from "@/components/ui";
import { useFilings, useIpfsJson, useIpfsText } from "@/hooks/use-agreement";
import { useStream } from "@/hooks/use-stream";
import { type AgreementView, type MilestoneView, roleOf } from "@/lib/agreement";
import { formatDate } from "@/lib/format";
import { DeliveryDocument, EvidenceDocument, type FileRef, type InspectionReport } from "@/lib/schemas";
import { formatBytes, ipfsUrl, isImage, isText } from "@/lib/upload";

export function FileCard({ file }: { file: FileRef }) {
  const [open, setOpen] = useState(false);
  const text = useIpfsText(file.cid, open && isText(file.mediaType));
  return (
    <div className="border border-rule bg-sheet">
      {isImage(file.mediaType) && (
        <a href={ipfsUrl(file.cid)} target="_blank" rel="noreferrer" className="block border-b border-rule bg-paper-2 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- IPFS content, served by our sandboxed proxy */}
          <img src={ipfsUrl(file.cid)} alt={file.name} className="mx-auto max-h-56 object-contain" loading="lazy" />
        </a>
      )}
      <div className="flex items-center justify-between gap-3 px-3 py-2">
        <div className="min-w-0">
          <p className="truncate font-mono text-[0.8rem]">{file.name}</p>
          <p className="font-mono text-[0.65rem] text-ink-4">
            {file.mediaType} · {formatBytes(file.size)}
          </p>
        </div>
        <div className="flex shrink-0 gap-3 font-mono text-[0.7rem] uppercase tracking-wider">
          {isText(file.mediaType) && (
            <button className="text-ink-3 hover:text-ink" onClick={() => setOpen((v) => !v)}>
              {open ? "Hide" : "Read"}
            </button>
          )}
          <a href={ipfsUrl(file.cid)} target="_blank" rel="noreferrer" className="text-ink-3 hover:text-ink">
            Open ↗
          </a>
        </div>
      </div>
      {open && (
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap border-t border-rule bg-paper-2 px-4 py-3 font-mono text-[0.78rem] leading-relaxed text-ink-2">
          {text.isLoading ? "Loading…" : (text.data ?? "Could not load the file.")}
        </pre>
      )}
    </div>
  );
}

export function DeliveryView({ agreement, milestone }: { agreement: AgreementView; milestone: MilestoneView }) {
  const { data, isLoading, error } = useIpfsJson(milestone.deliveryCID || undefined, DeliveryDocument);
  if (!milestone.deliveryCID) return null;
  if (isLoading) return <div className="h-24 skeleton" />;
  if (error || !data) return <Notice tone="amber">The delivery record could not be loaded from IPFS.</Notice>;
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="label">Delivery · {formatDate(milestone.deliveredAt)}</p>
        <a href={ipfsUrl(milestone.deliveryCID)} target="_blank" rel="noreferrer" className="link font-mono text-[0.68rem] text-ink-3">
          ipfs://{milestone.deliveryCID.slice(0, 16)}… ↗
        </a>
      </div>
      {data.note && <p className="whitespace-pre-line leading-relaxed text-ink-2">{data.note}</p>}
      {data.files.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {data.files.map((f) => (
            <FileCard key={f.cid} file={f} />
          ))}
        </div>
      )}
      {data.links.length > 0 && (
        <ul className="grid gap-1 text-sm">
          {data.links.map((l) => (
            <li key={l}>
              <a className="link break-all" href={l} target="_blank" rel="noreferrer noopener">
                {l}
              </a>
            </li>
          ))}
        </ul>
      )}
      <Inspector agreementId={agreement.id} milestone={milestone.index} />
    </div>
  );
}

const VERDICT_COPY: Record<InspectionReport["verdict"], { label: string; tone: string }> = {
  meets: { label: "Meets the criteria", tone: "text-ledger" },
  partially_meets: { label: "Partially meets the criteria", tone: "text-amber" },
  does_not_meet: { label: "Does not meet the criteria", tone: "text-seal" },
  insufficient_evidence: { label: "Not enough to judge", tone: "text-ink-3" },
};

/** Optional AI pre-check before approving: non-binding, cached per delivery. */
function Inspector({ agreementId, milestone }: { agreementId: number; milestone: number }) {
  const stream = useStream();
  const [report, setReport] = useState<Partial<InspectionReport> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const buffer = useRef("");

  function inspect() {
    setError(null);
    setReport({});
    buffer.current = "";
    void stream.start("/api/ai/inspect", { agreementId, milestone }, ({ event, data }) => {
      const d = data as Record<string, unknown>;
      if (event === "delta") {
        buffer.current += d.delta as string;
        try {
          setReport(parse(buffer.current, Allow.ALL));
        } catch {}
      } else if (event === "done") setReport(d.report as InspectionReport);
      else if (event === "error") {
        setError(d.message as string);
        setReport(null);
      }
    });
  }

  if (!report) {
    return (
      <div className="flex flex-wrap items-center gap-3 border-t border-rule pt-4">
        <button className="btn btn-line btn-sm" onClick={inspect}>
          Ask the Inspector
        </button>
        <span className="text-xs text-ink-3">An AI check of this delivery against its acceptance criteria. Advice, not a ruling.</span>
        {error && <span className="text-sm text-seal">{error}</span>}
      </div>
    );
  }
  const verdict = report.verdict ? VERDICT_COPY[report.verdict] : null;
  return (
    <div className="border-l-2 border-ink-blue/70 bg-paper-2 px-4 py-3">
      <p className="label">Inspector’s report</p>
      {verdict ? <p className={`mt-1 font-serif text-xl ${verdict.tone}`}>{verdict.label}</p> : <Dots label="Inspecting" />}
      {report.summary && <p className="mt-1 text-sm leading-relaxed text-ink-2">{report.summary}</p>}
      {report.criteria && report.criteria.length > 0 && (
        <ul className="mt-3 grid gap-1.5 text-sm">
          {report.criteria.map((c, i) => (
            <li key={i} className="grid grid-cols-[1rem_1fr] gap-2">
              <span className={c?.assessment === "met" ? "text-ledger" : c?.assessment === "not_met" ? "text-seal" : "text-amber"}>
                {c?.assessment === "met" ? "✓" : c?.assessment === "not_met" ? "✕" : "◐"}
              </span>
              <span>
                {c?.criterion}
                {c?.reasoning && <span className="block text-xs text-ink-3">{c.reasoning}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {report.suggestions && report.suggestions.length > 0 && (
        <ul className="mt-3 grid gap-1 text-sm text-ink-2">
          {report.suggestions.map((s, i) => (
            <li key={i}>→ {s}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function FilingsView({ agreement, milestone, me }: { agreement: AgreementView; milestone: MilestoneView; me?: string }) {
  const { data: filings, isLoading } = useFilings(agreement.id, milestone.index, milestone.disputedAt > 0);
  if (!milestone.disputedAt) return null;
  if (isLoading) return <div className="h-24 skeleton" />;
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="label">The record · {filings?.length ?? 0} filing(s)</p>
        <p className="font-mono text-[0.68rem] text-ink-3">
          Client {milestone.clientFiled ? "has filed" : "has not filed"} · provider {milestone.providerFiled ? "has filed" : "has not filed"}
        </p>
      </div>
      <ol className="grid gap-3">
        {filings?.map((f, i) => (
          <Filing key={`${f.cid}-${i}`} n={i + 1} by={f.by} at={f.at} cid={f.cid} role={roleOf(agreement, f.by)} you={me?.toLowerCase() === f.by.toLowerCase()} />
        ))}
      </ol>
    </div>
  );
}

function Filing({ n, by, at, cid, role, you }: { n: number; by: string; at: number; cid: string; role: string; you: boolean }) {
  const { data, isLoading } = useIpfsJson(cid, EvidenceDocument);
  return (
    <li className={`border-l-2 pl-4 ${role === "client" ? "border-ink-blue" : "border-ledger"}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-serif text-lg italic">Filing {n}</span>
        <span className="label">{role}</span>
        <AddressTag address={by} you={you} />
        <span className="font-mono text-[0.68rem] text-ink-4">{formatDate(at)}</span>
      </div>
      {isLoading ? (
        <div className="mt-2 h-10 skeleton" />
      ) : data ? (
        <>
          <p className="mt-2 whitespace-pre-line text-[0.95rem] leading-relaxed text-ink-2">{data.statement}</p>
          {data.files.length > 0 && (
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {data.files.map((f) => (
                <FileCard key={f.cid} file={f} />
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="mt-2 text-sm text-ink-4">Filing document unavailable.</p>
      )}
    </li>
  );
}
