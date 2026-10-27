import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AgreementPage } from "@/components/agreement/agreement-page";
import { agreementNumber } from "@/lib/format";
import { loadTerms } from "@/lib/server/case-file";
import { readAgreement } from "@/lib/server/chain";

function parseId(raw: string) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 && id < 1e12 ? id : null;
}

export async function generateMetadata(props: PageProps<"/a/[id]">): Promise<Metadata> {
  const id = parseId((await props.params).id);
  if (!id) return { title: "Agreement" };
  const fallback: Metadata = {
    title: `Agreement ${agreementNumber(id)}`,
    description: "A Pactum agreement: escrowed on-chain, adjudicated by an AI tribunal.",
  };
  // Metadata must never hold up the page: a slow RPC or IPFS gateway falls back to a generic title.
  const lookup = (async (): Promise<Metadata> => {
    const agreement = await readAgreement(id);
    const terms = agreement ? await loadTerms(agreement.termsCID) : null;
    if (!terms) return fallback;
    return { title: terms.draft.title, description: terms.draft.summary };
  })().catch(() => fallback);
  const timeout = new Promise<Metadata>((resolve) => setTimeout(() => resolve(fallback), 1500));
  return Promise.race([lookup, timeout]);
}

export default async function Page(props: PageProps<"/a/[id]">) {
  const id = parseId((await props.params).id);
  if (!id) notFound();
  return <AgreementPage id={id} />;
}
