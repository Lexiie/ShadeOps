"use client";

import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import type { ReactElement, ReactNode } from "react";
import { useMemo } from "react";
import { resolveDevnetRpcEndpoint } from "@/lib/solanaRpc";

function getWalletRpcEndpoint(): string {
  return resolveDevnetRpcEndpoint(process.env.NEXT_PUBLIC_SOLANA_RPC_URL);
}

/**
 * Provides Solana wallet adapter context for admin approval and signing flows.
 */
export function WalletContextProvider({ children }: Readonly<{ children: ReactNode }>): ReactElement {
  const endpoint = useMemo(() => getWalletRpcEndpoint(), []);
  const wallets = useMemo(() => [new PhantomWalletAdapter(), new SolflareWalletAdapter()], []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
