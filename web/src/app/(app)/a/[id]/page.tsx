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
  try {
    const agreement = await readAgreement(id);
    const terms = agreement ? await loadTerms(agreement.termsCID) : null;
    const title = terms?.draft.title ?? `Agreement ${agreementNumber(id)}`;
    return {
      title,
      description: terms?.draft.summary ?? "A Pactum agreement: escrowed on-chain, adjudicated by an AI tribunal.",
    };
  } catch {
    return { title: `Agreement ${agreementNumber(id)}` };
  }
}

export default async function Page(props: PageProps<"/a/[id]">) {
  const id = parseId((await props.params).id);
  if (!id) notFound();
  return <AgreementPage id={id} />;
}
