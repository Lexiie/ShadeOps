import type { Metadata } from "next";
import type { ReactElement, ReactNode } from "react";
import { JetBrains_Mono, Lilita_One, Nunito } from "next/font/google";
import "@solana/wallet-adapter-react-ui/styles.css";
import "./globals.css";
import { WalletContextProvider } from "@/components/WalletContextProvider";
import { cn } from "@/lib/utils";

const lilitaOne = Lilita_One({ subsets: ["latin"], weight: "400", variable: "--font-hero" });
const nunito = Nunito({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-nunito" });
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
      <body className={cn(lilitaOne.variable, nunito.variable, nunito.className, jetBrainsMono.variable, "min-h-screen")}>
        <WalletContextProvider>{children}</WalletContextProvider>
      </body>
    </html>
  );
}
