import "server-only";
import { type AgreementView, sealSeed } from "@/lib/agreement";
import { tokenFor } from "@/lib/config";
import { RulingDocument } from "@/lib/schemas";
import { loadTerms } from "./case-file";
import { readRecentAgreements } from "./chain";
import { fetchJSON } from "./ipfs";

export type Precedent = {
  agreementId: number;
  milestone: number;
  seed: string;
  title: string;
  category: string;
  amount: string;
  ruledAt: number;
  ruling: RulingDocument;
};

/** Every ruling issued on recent agreements, newest first: Pactum's body of case law. */
export async function readPrecedents(scan = 80): Promise<Precedent[]> {
  let agreements: AgreementView[];
  try {
    agreements = await readRecentAgreements(scan);
  } catch {
    return [];
  }
  const cases = agreements.flatMap((a) => a.milestones.filter((m) => m.rulingCID).map((m) => ({ a, m })));
  const results = await Promise.all(
    cases.map(async ({ a, m }) => {
      try {
        const [doc, terms] = await Promise.all([fetchJSON(m.rulingCID), loadTerms(a.termsCID)]);
        const ruling = RulingDocument.safeParse(doc);
        if (!ruling.success) return null;
        const token = tokenFor(a.token);
        const precedent: Precedent = {
          agreementId: a.id,
          milestone: m.index,
          seed: sealSeed(a),
          title: terms?.draft.title ?? `Agreement ${a.id}`,
          category: terms?.draft.category ?? "other",
          amount: `${Number(m.amount) / 10 ** token.decimals} ${token.symbol}`,
          ruledAt: m.ruledAt,
          ruling: ruling.data,
        };
        return precedent;
      } catch {
        return null;
      }
    }),
  );
  return results.filter((p): p is Precedent => p !== null).sort((x, y) => y.ruledAt - x.ruledAt);
}
