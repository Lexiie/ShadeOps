"use client";

import { PublicKey } from "@solana/web3.js";
import { decimalToBaseUnits } from "./amounts";
import type { PrivacyExecutionReference, PrivacyExecutionRequest } from "./types";
import { decimalsForToken, defaultMintForToken, normalizeTokenSymbol } from "@/lib/tokens";

/**
 * Executes a Cloak payout through the Cloak 0.1.6 functional UTXO API.
 *
 * This path intentionally avoids the removed legacy `generateNote`/`send` SDK API.
 * It shields SOL or a supported SPL token into a fresh UTXO, then withdraws that
 * shielded output to the resolved external recipient address so the public sender
 * trail is not a direct treasury-to-recipient transfer.
 */
export async function executeCloakPayout({ plan, connection, wallet }: PrivacyExecutionRequest): Promise<PrivacyExecutionReference[]> {
  if (!wallet.publicKey || !wallet.signTransaction || !wallet.signMessage) {
    throw new Error("Connect a wallet that can sign and send transactions before executing Cloak.");
  }

  if (!plan.parsedOperation.recipientWallet) {
    throw new Error("Recipient wallet is required for Cloak execution.");
  }

  const { CLOAK_PROGRAM_ID, NATIVE_SOL_MINT, createUtxo, createZeroUtxo, fullWithdraw, generateUtxoKeypair, transact } = await import("@cloak.dev/sdk");
  const token = resolveCloakToken(plan.parsedOperation.tokenSymbol, plan.parsedOperation.tokenMint, NATIVE_SOL_MINT);
  const amountBaseUnits = decimalToBaseUnits(plan.parsedOperation.amount, token.decimals);
  const recipient = new PublicKey(plan.parsedOperation.recipientWallet);
  const outputOwner = await generateUtxoKeypair();
  const outputUtxo = await createUtxo(amountBaseUnits, outputOwner, token.mint);
  const options = {
    connection,
    programId: CLOAK_PROGRAM_ID,
    signTransaction: wallet.signTransaction,
    signMessage: wallet.signMessage,
    depositorPublicKey: wallet.publicKey,
    walletPublicKey: wallet.publicKey,
    relayUrl: getOptionalPublicEnv("NEXT_PUBLIC_CLOAK_RELAY_URL"),
    enforceViewingKeyRegistration: false
  };

  const deposit = await transact(
    {
      inputUtxos: [await createZeroUtxo(token.mint), await createZeroUtxo(token.mint)],
      outputUtxos: [outputUtxo, await createZeroUtxo(token.mint)],
      externalAmount: amountBaseUnits,
      depositor: wallet.publicKey
    },
    options
  );

  const withdrawal = await fullWithdraw(
    deposit.outputUtxos.filter((utxo) => utxo.amount > 0n),
    recipient,
    {
      ...options,
      cachedMerkleTree: deposit.merkleTree,
      addressLookupTableAccounts: deposit.addressLookupTableAccounts
    }
  );

  return [
    {
      protocol: "cloak",
      signature: deposit.signature,
      label: "cloak-shield",
      metadata: createCloakReferenceMetadata(plan.operationId, recipient, token, amountBaseUnits, deposit.newRoot)
    },
    {
      protocol: "cloak",
      signature: withdrawal.signature,
      label: "cloak-full-withdraw",
      metadata: createCloakReferenceMetadata(plan.operationId, recipient, token, amountBaseUnits, withdrawal.newRoot)
    }
  ];
}

function createCloakReferenceMetadata(
  operationId: string,
  recipient: PublicKey,
  token: { symbol: string; mint: PublicKey },
  amountBaseUnits: bigint,
  root: string
): PrivacyExecutionReference["metadata"] {
  return {
    operationId,
    recipient: recipient.toBase58(),
    tokenSymbol: token.symbol,
    amountBaseUnits: amountBaseUnits.toString(),
    ...(token.symbol === "SOL" ? { amountLamports: amountBaseUnits.toString() } : { tokenMint: token.mint.toBase58() }),
    root
  };
}

export function resolveCloakToken(symbol: string, tokenMint: string | undefined, nativeSolMint: PublicKey): { symbol: string; mint: PublicKey; decimals: number } {
  const tokenSymbol = normalizeTokenSymbol(symbol);

  if (tokenSymbol === "SOL") {
    return { symbol: tokenSymbol, mint: nativeSolMint, decimals: decimalsForToken(tokenSymbol) };
  }

  if (tokenSymbol !== "USDC" && tokenSymbol !== "USDT") {
    throw new Error("Cloak execution in ShadeOps currently supports SOL, USDC, and USDT only.");
  }

  const resolvedMint = tokenMint ?? defaultMintForToken(tokenSymbol);

  if (!resolvedMint) {
    throw new Error(`Token mint is required for Cloak ${tokenSymbol} execution.`);
  }

  return { symbol: tokenSymbol, mint: new PublicKey(resolvedMint), decimals: decimalsForToken(tokenSymbol) };
}

function getOptionalPublicEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}
