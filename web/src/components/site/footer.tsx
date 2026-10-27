import Link from "next/link";
import { CHAIN_LABEL, PACTUM_ADDRESS, explorerAddress } from "@/lib/config";
import { shortAddress } from "@/lib/format";
import { Mark } from "./brand";

const REPO = "https://github.com/bhargavkumarj/BlockChain-GenAI";

export function Footer({ big = false }: { big?: boolean }) {
  const contract = PACTUM_ADDRESS ? explorerAddress(PACTUM_ADDRESS) : undefined;
  return (
    <footer className="border-t border-rule">
      {big && (
        <div className="mx-auto max-w-[1320px] overflow-hidden px-4 pt-16 sm:px-6">
          <p className="display select-none whitespace-nowrap text-[clamp(3.2rem,12.4vw,11.5rem)] leading-[0.85] text-ink">
            Pacta sunt <em className="text-seal">servanda.</em>
          </p>
          <p className="label mt-4">Latin: agreements must be kept. Now they can be.</p>
        </div>
      )}
      <div className="mx-auto grid max-w-[1320px] gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="flex items-start gap-3">
          <Mark size={30} />
          <p className="max-w-xs text-sm leading-relaxed text-ink-3">
            AI-drafted agreements, on-chain escrow and an AI tribunal for disputes. An open-source portfolio project.
          </p>
        </div>
        <FooterCol title="Product">
          <Link href="/draft">Draft an agreement</Link>
          <Link href="/ledger">Your ledger</Link>
          <Link href="/precedents">Precedents</Link>
        </FooterCol>
        <FooterCol title="Protocol">
          <Link href="/protocol">How it works</Link>
          <Link href="/protocol#trust">Trust model</Link>
          {PACTUM_ADDRESS ? (
            contract ? (
              <a href={contract} target="_blank" rel="noreferrer">
                Contract {shortAddress(PACTUM_ADDRESS)} ↗
              </a>
            ) : (
              <span className="font-mono text-xs">Contract {shortAddress(PACTUM_ADDRESS)}</span>
            )
          ) : (
            <span className="text-ink-4">Contract not deployed</span>
          )}
        </FooterCol>
        <FooterCol title="Source">
          <a href={REPO} target="_blank" rel="noreferrer">
            GitHub ↗
          </a>
          <span className="text-ink-4">{CHAIN_LABEL} · IPFS · Claude</span>
        </FooterCol>
      </div>
    </footer>
  );
}

function FooterCol({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="label">{title}</p>
      <div className="mt-3 flex flex-col gap-2 text-sm text-ink-2 [&_a:hover]:text-seal">{children}</div>
    </div>
  );
}
