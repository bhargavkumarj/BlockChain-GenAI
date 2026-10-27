import type { Metadata } from "next";
import { Ledger } from "@/components/ledger/ledger";

export const metadata: Metadata = { title: "Your ledger" };

export default function LedgerPage() {
  return <Ledger />;
}
