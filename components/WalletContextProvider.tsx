"use client";

import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { clusterApiUrl } from "@solana/web3.js";
import type { ReactElement, ReactNode } from "react";
import { useMemo } from "react";

function getWalletAdapterNetwork(): WalletAdapterNetwork {
  const network = process.env.NEXT_PUBLIC_SOLANA_NETWORK;

  if (network === "mainnet") {
    return WalletAdapterNetwork.Mainnet;
  }

  if (network === "testnet") {
    return WalletAdapterNetwork.Testnet;
  }

  return WalletAdapterNetwork.Devnet;
}

function getWalletRpcEndpoint(): string {
  return process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim() || clusterApiUrl(getWalletAdapterNetwork());
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
