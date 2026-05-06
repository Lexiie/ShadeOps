import type { Connection, PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import type { ExecutionPlan } from "@/lib/schemas/proof";

export type WalletExecutionAdapter = {
  publicKey: PublicKey | null;
  signMessage?: (message: Uint8Array) => Promise<Uint8Array>;
  signTransaction?: <T extends Transaction | VersionedTransaction>(transaction: T) => Promise<T>;
  sendTransaction?: (transaction: Transaction, connection: Connection, options?: never) => Promise<string>;
};

export type PrivacyExecutionReference = {
  protocol: "umbra" | "cloak";
  signature: string;
  label: string;
  metadata: Record<string, string | number | boolean>;
};

export type PrivacyExecutionRequest = {
  plan: ExecutionPlan;
  connection: Connection;
  wallet: WalletExecutionAdapter;
};
