"use client";

import { decimalToBaseUnits } from "./amounts";
import type { PrivacyExecutionReference, PrivacyExecutionRequest, WalletExecutionAdapter } from "./types";
import { decimalsForToken } from "@/lib/tokens";

export type UmbraClaimScanResult = {
  receivedCount: number;
  publicReceivedCount: number;
  nextScanStartIndex: number;
};

export type UmbraClaimResult = {
  references: PrivacyExecutionReference[];
  receivedCount: number;
};

/**
 * Executes a real Umbra receiver-claimable UTXO payout for SPL tokens.
 */
export async function executeUmbraPayout({ plan, wallet }: PrivacyExecutionRequest): Promise<PrivacyExecutionReference[]> {
  if (!wallet.publicKey || !wallet.signMessage) {
    throw new Error("Connect a wallet with message signing support before executing Umbra.");
  }

  if (!plan.parsedOperation.tokenMint || !plan.parsedOperation.recipientWallet) {
    throw new Error("Umbra execution requires token mint and recipient wallet.");
  }

  const [{ getUmbraClient, getUserRegistrationFunction, getPublicBalanceToReceiverClaimableUtxoCreatorFunction }, { getCreateReceiverClaimableUtxoFromPublicBalanceProver }] = await Promise.all([
    import("@umbra-privacy/sdk"),
    import("@umbra-privacy/web-zk-prover")
  ]);
  const signer = createUmbraSigner(wallet);
  const client = await getUmbraClient({
    signer: signer as never,
    network: getUmbraNetwork(),
    rpcUrl: getRequiredPublicEnv("NEXT_PUBLIC_SOLANA_RPC_URL"),
    rpcSubscriptionsUrl: getRequiredPublicEnv("NEXT_PUBLIC_SOLANA_RPC_WS_URL"),
    indexerApiEndpoint: getRequiredPublicEnv("NEXT_PUBLIC_UMBRA_INDEXER_API_ENDPOINT")
  });
  const register = getUserRegistrationFunction({ client });
  await register({ confidential: true, anonymous: true });

  const createUtxo = getPublicBalanceToReceiverClaimableUtxoCreatorFunction(
    { client },
    { zkProver: getCreateReceiverClaimableUtxoFromPublicBalanceProver() }
  );
  const result = await createUtxo({
    amount: decimalToBaseUnits(plan.parsedOperation.amount, getTokenDecimals(plan.parsedOperation.tokenSymbol)) as never,
    destinationAddress: plan.parsedOperation.recipientWallet as never,
    mint: plan.parsedOperation.tokenMint as never
  });

  return toUmbraExecutionReferences(result, plan.operationId, plan.parsedOperation.recipientWallet, plan.parsedOperation.tokenMint);
}

/**
 * Scans claimable Umbra UTXOs for the connected recipient wallet.
 */
export async function scanUmbraClaimablePayouts(wallet: WalletExecutionAdapter, options: { treeIndex?: number; startInsertionIndex?: number; endInsertionIndex?: number } = {}): Promise<UmbraClaimScanResult> {
  const { getClaimableUtxoScannerFunction } = await import("@umbra-privacy/sdk");
  const client = await createUmbraClient(wallet);
  const scanner = getClaimableUtxoScannerFunction({ client } as never);
  const result = await scanner((options.treeIndex ?? 0) as never, (options.startInsertionIndex ?? 0) as never, options.endInsertionIndex as never);

  return {
    receivedCount: result.received.length,
    publicReceivedCount: result.publicReceived.length,
    nextScanStartIndex: Number(result.nextScanStartIndex)
  };
}

/**
 * Claims receiver-claimable Umbra UTXOs into the recipient's encrypted balance.
 */
export async function claimUmbraReceivedPayouts(wallet: WalletExecutionAdapter, operationId: string, options: { treeIndex?: number; startInsertionIndex?: number; endInsertionIndex?: number } = {}): Promise<UmbraClaimResult> {
  const [{ getClaimableUtxoScannerFunction, getReceiverClaimableUtxoToEncryptedBalanceClaimerFunction, getUmbraRelayer }, { getClaimReceiverClaimableUtxoIntoEncryptedBalanceProver }] = await Promise.all([
    import("@umbra-privacy/sdk"),
    import("@umbra-privacy/web-zk-prover")
  ]);
  const client = await createUmbraClient(wallet);
  const scanner = getClaimableUtxoScannerFunction({ client } as never);
  const scanned = await scanner((options.treeIndex ?? 0) as never, (options.startInsertionIndex ?? 0) as never, options.endInsertionIndex as never);
  const received = [...scanned.received, ...scanned.publicReceived];

  if (received.length === 0) {
    return { references: [], receivedCount: 0 };
  }

  const relayer = getUmbraRelayer({ apiEndpoint: getRequiredPublicEnv("NEXT_PUBLIC_UMBRA_RELAYER_API_ENDPOINT") });
  const claim = getReceiverClaimableUtxoToEncryptedBalanceClaimerFunction(
    { client } as never,
    { zkProver: getClaimReceiverClaimableUtxoIntoEncryptedBalanceProver(), relayer } as never
  );
  const result = await claim(received as never);

  return {
    references: toUmbraClaimExecutionReferences(result, operationId),
    receivedCount: received.length
  };
}

async function createUmbraClient(wallet: WalletExecutionAdapter): Promise<unknown> {
  const { getUmbraClient, getUserRegistrationFunction } = await import("@umbra-privacy/sdk");
  const signer = createUmbraSigner(wallet);
  const client = await getUmbraClient({
    signer: signer as never,
    network: getUmbraNetwork(),
    rpcUrl: getRequiredPublicEnv("NEXT_PUBLIC_SOLANA_RPC_URL"),
    rpcSubscriptionsUrl: getRequiredPublicEnv("NEXT_PUBLIC_SOLANA_RPC_WS_URL"),
    indexerApiEndpoint: getRequiredPublicEnv("NEXT_PUBLIC_UMBRA_INDEXER_API_ENDPOINT")
  });
  const register = getUserRegistrationFunction({ client });
  await register({ confidential: true, anonymous: true });

  return client;
}

/**
 * Converts Umbra SDK transaction signatures into proof references.
 */
export function toUmbraExecutionReferences(result: UmbraUtxoCreationResult, operationId: string, recipient: string, tokenMint: string): PrivacyExecutionReference[] {
  return extractUmbraSignatures(result).map((signature: string, index: number) => ({
    protocol: "umbra",
    signature,
    label: `umbra-receiver-claimable-utxo-${index + 1}`,
    metadata: {
      operationId,
      recipient,
      tokenMint
    }
  }));
}

export function toUmbraClaimExecutionReferences(result: UmbraClaimSdkResult, operationId: string): PrivacyExecutionReference[] {
  return extractUmbraClaimSignatures(result).map((signature, index) => ({
    protocol: "umbra",
    signature,
    label: `umbra-receiver-claim-${index + 1}`,
    metadata: {
      operationId,
      claim: true
    }
  }));
}

type UmbraUtxoCreationResult =
  | readonly string[]
  | {
      readonly closeProofAccountSignature?: string;
      readonly createProofAccountSignature?: string;
      readonly createUtxoSignature?: string;
    };

function extractUmbraSignatures(result: UmbraUtxoCreationResult): string[] {
  if (Array.isArray(result)) {
    return result.filter(Boolean);
  }

  const signatureResult = result as Exclude<UmbraUtxoCreationResult, readonly string[]>;

  return [signatureResult.createProofAccountSignature, signatureResult.createUtxoSignature, signatureResult.closeProofAccountSignature].filter(Boolean) as string[];
}

type UmbraClaimSdkResult = {
  readonly batches?: Map<unknown, { readonly txSignature?: string; readonly callbackSignature?: string }>;
};

function extractUmbraClaimSignatures(result: UmbraClaimSdkResult): string[] {
  const signatures: string[] = [];

  for (const batch of result.batches?.values() ?? []) {
    if (batch.txSignature) {
      signatures.push(batch.txSignature);
    }

    if (batch.callbackSignature) {
      signatures.push(batch.callbackSignature);
    }
  }

  return signatures;
}

/**
 * Creates the Umbra signer interface from a connected Solana wallet adapter.
 */
export function createUmbraSigner(wallet: WalletExecutionAdapter): {
  readonly address: string;
  signMessage: (message: Uint8Array) => Promise<{ message: Uint8Array; signature: Uint8Array; signer: string }>;
  signTransaction: (transaction: unknown) => Promise<unknown>;
  signTransactions: (transactions: readonly unknown[]) => Promise<unknown[]>;
} {
  if (!wallet.publicKey || !wallet.signMessage) {
    throw new Error("Wallet public key and signMessage are required for Umbra signer creation.");
  }

  const address = wallet.publicKey.toBase58();

  return {
    address,
    signMessage: async (message: Uint8Array) => ({ message, signature: await wallet.signMessage?.(message) ?? new Uint8Array(), signer: address }),
    signTransaction: async (transaction: unknown) => {
      return signUmbraTransactionWithMessageSigner(transaction, wallet, address);
    },
    signTransactions: async (transactions: readonly unknown[]) => {
      return Promise.all(transactions.map((transaction) => signUmbraTransactionWithMessageSigner(transaction, wallet, address)));
    }
  };
}

/**
 * Signs an Umbra @solana/kit transaction by signing its compiled message bytes with the wallet.
 */
export async function signUmbraTransactionWithMessageSigner(transaction: unknown, wallet: WalletExecutionAdapter, address: string): Promise<unknown> {
  if (!wallet.signMessage) {
    throw new Error("Wallet message signing is required for Umbra transaction signing.");
  }

  const signable = transaction as { messageBytes?: Uint8Array; signatures?: Record<string, Uint8Array | null> };

  if (!signable.messageBytes || !signable.signatures) {
    throw new Error("Umbra produced an unsupported transaction shape.");
  }

  return {
    ...signable,
    signatures: {
      ...signable.signatures,
      [address]: await wallet.signMessage(signable.messageBytes)
    }
  };
}

/**
 * Resolves token decimals for the currently supported payout tokens.
 */
export function getTokenDecimals(symbol: string): number {
  return decimalsForToken(symbol);
}

/**
 * Resolves the Umbra network from public runtime configuration.
 */
export function getUmbraNetwork(): "mainnet" | "devnet" | "localnet" {
  const network = process.env.NEXT_PUBLIC_SOLANA_NETWORK;

  if (network === "mainnet" || network === "localnet") {
    return network;
  }

  return "devnet";
}

/**
 * Reads a required public runtime environment variable for browser-side SDK execution.
 */
export function getRequiredPublicEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required for Umbra execution.`);
  }

  return value;
}
