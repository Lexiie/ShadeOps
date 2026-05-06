import type { Metadata } from "next";
import type { ReactElement, ReactNode } from "react";
import { Fredoka, JetBrains_Mono, Lilita_One } from "next/font/google";
import "@solana/wallet-adapter-react-ui/styles.css";
import "./globals.css";
import { WalletContextProvider } from "@/components/WalletContextProvider";
import { cn } from "@/lib/utils";

const lilitaOne = Lilita_One({ subsets: ["latin"], weight: "400", variable: "--font-hero" });
const fredoka = Fredoka({ subsets: ["latin"], weight: "400", variable: "--font-sans" });
const jetBrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "ShadeOps Agent",
  description: "Agentic private payout operator for Solana teams."
};

/**
 * Provides the application shell, fonts, dark theme, and wallet context.
 */
export default function RootLayout({ children }: Readonly<{ children: ReactNode }>): ReactElement {
  return (
    <html lang="en" className="dark">
      <body className={cn(lilitaOne.variable, fredoka.variable, jetBrainsMono.variable, "min-h-screen font-sans")}>
        <WalletContextProvider>{children}</WalletContextProvider>
      </body>
    </html>
  );
}
