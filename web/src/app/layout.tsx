import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Instrument_Serif, Schibsted_Grotesk } from "next/font/google";
import { SITE_URL } from "@/lib/config";
import "./globals.css";

const serif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument",
  display: "swap",
});

const sans = Schibsted_Grotesk({
  subsets: ["latin"],
  variable: "--font-schibsted",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Pactum — agreements that keep themselves", template: "%s · Pactum" },
  description:
    "Describe a deal in plain words. Pactum drafts it with AI, locks the money in an on-chain escrow, and convenes an AI tribunal if anything goes wrong.",
  applicationName: "Pactum",
  keywords: ["escrow", "smart contracts", "AI arbitration", "freelance", "IPFS", "Base", "agentic AI"],
  openGraph: {
    type: "website",
    title: "Pactum — agreements that keep themselves",
    description: "AI-drafted agreements, on-chain escrow, and an AI tribunal for disputes.",
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3efe6" },
    { media: "(prefers-color-scheme: dark)", color: "#11100d" },
  ],
};

/** Runs before paint so the stored or system theme is applied without a flash. */
const themeScript = `(function(){try{var t=localStorage.getItem("pactum.theme");if(t!=="light"&&t!=="dark"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.dataset.theme=t}catch(e){}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
