import { Providers } from "@/components/providers";
import { Footer } from "@/components/site/footer";
import { Header } from "@/components/site/header";
import { StatusStrip } from "@/components/site/status-strip";
import { WalletButton } from "@/components/wallet/wallet-button";

/** Everything behind "Open app" shares the wallet providers; the landing page stays free of wallet code. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <Header actions={<WalletButton />} />
      <StatusStrip />
      <main className="min-h-[calc(100dvh-4rem)]">{children}</main>
      <Footer />
    </Providers>
  );
}
