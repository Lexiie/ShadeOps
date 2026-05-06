import { Connection } from "@solana/web3.js";
import type { ExecutionPlan, ExecutionReference } from "@/lib/schemas/proof";

type SignatureStatus = {
  err: unknown;
  confirmationStatus?: string | null;
  signerAddresses?: string[];
  accountAddresses?: string[];
};

export type SignatureVerificationFetcher = (signature: string) => Promise<SignatureStatus | null>;

type VerificationOptions = {
  expectedSigner?: string;
  expectedPlan?: ExecutionPlan;
  fetchStatus?: SignatureVerificationFetcher;
};

const ACCEPTED_CONFIRMATION_STATUSES = new Set(["confirmed", "finalized"]);

/**
 * Verifies reported protocol signatures exist on-chain before proof creation.
 */
export async function verifyExecutionReferencesOnChain(references: ExecutionReference[], options: VerificationOptions = {}): Promise<void> {
  const fetchStatus = options.fetchStatus ?? createRpcStatusFetcher();

  for (const reference of references) {
    const status = await fetchStatus(reference.signature);

    if (!status) {
      throw new Error(`Execution signature ${reference.signature} was not found on the configured Solana RPC.`);
    }

    if (status.err) {
      throw new Error(`Execution signature ${reference.signature} failed on-chain.`);
    }

    if (status.confirmationStatus && !ACCEPTED_CONFIRMATION_STATUSES.has(status.confirmationStatus)) {
      throw new Error(`Execution signature ${reference.signature} is not confirmed or finalized yet.`);
    }

    if (options.expectedSigner && !status.signerAddresses?.includes(options.expectedSigner)) {
      throw new Error(`Execution signature ${reference.signature} was not signed by the approving admin wallet.`);
    }

    if (options.expectedPlan) {
      validateDecodedTransactionHints(reference, status, options.expectedPlan);
    }
  }
}

function validateDecodedTransactionHints(reference: ExecutionReference, status: SignatureStatus, plan: ExecutionPlan): void {
  const accounts = new Set(status.accountAddresses ?? []);
  const recipient = plan.parsedOperation.recipientWallet;
  const tokenMint = plan.parsedOperation.tokenMint;

  if (reference.protocol === "cloak" && reference.label.includes("withdraw") && recipient && !accounts.has(recipient)) {
    throw new Error("Decoded Cloak withdrawal transaction does not reference the approved recipient.");
  }

  if (reference.protocol === "umbra" && tokenMint && !accounts.has(tokenMint)) {
    throw new Error("Decoded Umbra transaction does not reference the approved token mint.");
  }
}

function createRpcStatusFetcher(): SignatureVerificationFetcher {
  const rpcUrl = process.env.SOLANA_RPC_URL;

  if (!rpcUrl) {
    throw new Error("SOLANA_RPC_URL is required to verify execution references before proof creation.");
  }

  const connection = new Connection(rpcUrl, "confirmed");

  return async (signature: string) => {
    const [statusResponse, transaction] = await Promise.all([
      connection.getSignatureStatuses([signature], { searchTransactionHistory: true }),
      connection.getParsedTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 })
    ]);
    const status = statusResponse.value[0];

    if (!status) {
      return null;
    }

    return {
      err: status.err,
      confirmationStatus: status.confirmationStatus,
      signerAddresses: transaction ? extractParsedTransactionSigners(transaction) : [],
      accountAddresses: transaction ? extractParsedTransactionAccounts(transaction) : []
    };
  };
}

function extractParsedTransactionSigners(transaction: unknown): string[] {
  const accountKeys = (transaction as { transaction?: { message?: { accountKeys?: unknown[] } } }).transaction?.message?.accountKeys ?? [];

  return accountKeys
    .map((accountKey) => {
      const key = accountKey as { pubkey?: { toBase58?: () => string } | string; signer?: boolean };

      if (!key.signer) {
        return null;
      }

      if (typeof key.pubkey === "string") {
        return key.pubkey;
      }

      return key.pubkey?.toBase58?.() ?? null;
    })
    .filter((value): value is string => Boolean(value));
}

function extractParsedTransactionAccounts(transaction: unknown): string[] {
  const addresses = new Set<string>();
  const parsed = transaction as { transaction?: { message?: { accountKeys?: unknown[]; instructions?: unknown[] } }; meta?: { innerInstructions?: Array<{ instructions?: unknown[] }> } };

  for (const accountKey of parsed.transaction?.message?.accountKeys ?? []) {
    const address = readAccountAddress(accountKey);

    if (address) {
      addresses.add(address);
    }
  }

  for (const instruction of parsed.transaction?.message?.instructions ?? []) {
    collectInstructionAccounts(instruction, addresses);
  }

  for (const inner of parsed.meta?.innerInstructions ?? []) {
    for (const instruction of inner.instructions ?? []) {
      collectInstructionAccounts(instruction, addresses);
    }
  }

  return [...addresses];
}

function collectInstructionAccounts(instruction: unknown, addresses: Set<string>): void {
  const item = instruction as { accounts?: unknown[]; programId?: unknown; parsed?: { info?: Record<string, unknown> } };
  const programId = readAccountAddress(item.programId);

  if (programId) {
    addresses.add(programId);
  }

  for (const account of item.accounts ?? []) {
    const address = readAccountAddress(account);

    if (address) {
      addresses.add(address);
    }
  }

  for (const value of Object.values(item.parsed?.info ?? {})) {
    const address = readAccountAddress(value);

    if (address) {
      addresses.add(address);
    }
  }
}

function readAccountAddress(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }

  const key = value as { pubkey?: { toBase58?: () => string } | string; toBase58?: () => string };

  if (typeof key.pubkey === "string") {
    return key.pubkey;
  }

  return key.pubkey?.toBase58?.() ?? key.toBase58?.() ?? null;
}
