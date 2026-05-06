"use client";

import { PublicKey } from "@solana/web3.js";
import { solToLamports } from "./amounts";
import type { PrivacyExecutionReference, PrivacyExecutionRequest } from "./types";

/**
 * Executes a Cloak native SOL payout through the Cloak 0.1.6 functional UTXO API.
 *
 * This path intentionally avoids the removed legacy `generateNote`/`send` SDK API.
 * It shields native SOL into a fresh UTXO, then withdraws that shielded output to
 * the resolved external recipient address so the public sender trail is not a
 * direct treasury-to-recipient transfer.
 */
export async function executeCloakPayout({ plan, connection, wallet }: PrivacyExecutionRequest): Promise<PrivacyExecutionReference[]> {
  if (!wallet.publicKey || !wallet.signTransaction || !wallet.signMessage) {
    throw new Error("Connect a wallet that can sign and send transactions before executing Cloak.");
  }

  if (plan.parsedOperation.tokenSymbol !== "SOL") {
    throw new Error("This ShadeOps Cloak adapter path is wired for native SOL execution. Cloak USDC/USDT execution requires the token or swap execution path to be enabled before signing.");
  }

  if (!plan.parsedOperation.recipientWallet) {
    throw new Error("Recipient wallet is required for Cloak execution.");
  }

  const { CLOAK_PROGRAM_ID, NATIVE_SOL_MINT, createUtxo, createZeroUtxo, fullWithdraw, generateUtxoKeypair, transact } = await import("@cloak.dev/sdk");
  const lamports = solToLamports(plan.parsedOperation.amount);
  const recipient = new PublicKey(plan.parsedOperation.recipientWallet);
  const outputOwner = await generateUtxoKeypair();
  const outputUtxo = await createUtxo(lamports, outputOwner, NATIVE_SOL_MINT);

  const deposit = await transact(
    {
      inputUtxos: [await createZeroUtxo(NATIVE_SOL_MINT), await createZeroUtxo(NATIVE_SOL_MINT)],
      outputUtxos: [outputUtxo, await createZeroUtxo(NATIVE_SOL_MINT)],
      externalAmount: lamports,
      depositor: wallet.publicKey
    },
    {
      connection,
      programId: CLOAK_PROGRAM_ID,
      signTransaction: wallet.signTransaction,
      signMessage: wallet.signMessage,
      depositorPublicKey: wallet.publicKey,
      walletPublicKey: wallet.publicKey,
      enforceViewingKeyRegistration: false
    }
  );

  const withdrawal = await fullWithdraw(
    deposit.outputUtxos.filter((utxo) => utxo.amount > 0n),
    recipient,
    {
      connection,
      programId: CLOAK_PROGRAM_ID,
      signTransaction: wallet.signTransaction,
      signMessage: wallet.signMessage,
      depositorPublicKey: wallet.publicKey,
      walletPublicKey: wallet.publicKey,
      cachedMerkleTree: deposit.merkleTree,
      enforceViewingKeyRegistration: false
    }
  );

  return [
    {
      protocol: "cloak",
      signature: deposit.signature,
      label: "cloak-shield",
      metadata: {
        operationId: plan.operationId,
        recipient: recipient.toBase58(),
        amountLamports: lamports.toString(),
        root: deposit.newRoot
      }
    },
    {
      protocol: "cloak",
      signature: withdrawal.signature,
      label: "cloak-full-withdraw",
      metadata: {
        operationId: plan.operationId,
        recipient: recipient.toBase58(),
        amountLamports: lamports.toString(),
        root: withdrawal.newRoot
      }
    }
  ];
}
