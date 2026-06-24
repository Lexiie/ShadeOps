"use client";

import { PublicKey } from "@solana/web3.js";
import { decimalToBaseUnits } from "./amounts";
import type { PrivacyExecutionReference, PrivacyExecutionRequest } from "./types";
import { decimalsForToken, normalizeTokenSymbol } from "@/lib/tokens";

const CLOAK_DEVNET_RELAY_URL = "https://api.devnet.cloak.ag";
const CLOAK_TRANSACTION_CIRCUITS_URL = "https://storage.googleapis.com/cloak-circuits/circuits/0.1.0";
const CLOAK_CIRCUIT_WASM_PATH = "transaction_js/transaction.wasm";
const CLOAK_CIRCUIT_WASM_MAGIC = [0x00, 0x61, 0x73, 0x6d];

/**
 * Executes a Cloak devnet payout through the Cloak functional UTXO API.
 *
 * This path intentionally avoids the removed legacy `generateNote`/`send` SDK API.
 * It shields SOL or devnet mock USDC into a fresh UTXO, then withdraws that
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

  const cloakSdk = await import("@cloak.dev/sdk-devnet");
  const { CLOAK_PROGRAM_ID, DEVNET_MOCK_USDC_MINT, NATIVE_SOL_MINT, createUtxo, createZeroUtxo, fullWithdraw, generateUtxoKeypair, transact } = cloakSdk;
  const token = resolveCloakToken(plan.parsedOperation.tokenSymbol, plan.parsedOperation.tokenMint, NATIVE_SOL_MINT, DEVNET_MOCK_USDC_MINT);
  const circuitsUrl = resolveCloakCircuitsUrl();

  cloakSdk.setCircuitsPath(circuitsUrl);
  await validateCloakCircuitWasm(circuitsUrl);

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
    relayUrl: getOptionalPublicEnv("NEXT_PUBLIC_CLOAK_RELAY_URL") ?? CLOAK_DEVNET_RELAY_URL,
    enforceViewingKeyRegistration: false
  };

  try {
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
  } catch (error) {
    throw normalizeCloakExecutionError(error, circuitsUrl);
  }
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

export function resolveCloakToken(symbol: string, tokenMint: string | undefined, nativeSolMint: PublicKey, devnetMockUsdcMint: PublicKey): { symbol: string; mint: PublicKey; decimals: number } {
  const tokenSymbol = normalizeTokenSymbol(symbol);

  if (tokenSymbol === "SOL") {
    return { symbol: tokenSymbol, mint: nativeSolMint, decimals: decimalsForToken(tokenSymbol) };
  }

  if (tokenSymbol === "USDT") {
    throw new Error("Cloak devnet execution currently supports SOL and devnet mock USDC only; use mainnet Cloak for USDT.");
  }

  if (tokenSymbol !== "USDC") {
    throw new Error("Cloak devnet execution in ShadeOps currently supports SOL and devnet mock USDC only.");
  }

  if (tokenMint && tokenMint !== devnetMockUsdcMint.toBase58()) {
    throw new Error("Cloak devnet USDC execution requires the SDK devnet mock USDC mint.");
  }

  return { symbol: tokenSymbol, mint: devnetMockUsdcMint, decimals: decimalsForToken(tokenSymbol) };
}

export function resolveCloakCircuitsUrl(): string {
  return stripTrailingSlash(getOptionalPublicEnv("NEXT_PUBLIC_CLOAK_CIRCUITS_URL") ?? CLOAK_TRANSACTION_CIRCUITS_URL);
}

export async function validateCloakCircuitWasm(circuitsBaseUrl: string, fetchFn: typeof fetch = fetch): Promise<void> {
  const wasmUrl = buildCloakCircuitWasmUrl(circuitsBaseUrl);
  let response: Response;

  try {
    response = await fetchFn(wasmUrl, {
      cache: "no-store",
      headers: { range: "bytes=0-15" }
    });
  } catch (error) {
    throw new Error(`Cloak circuit WASM could not be fetched from ${wasmUrl}. ${formatCause(error)}`);
  }

  const contentType = response.headers.get("content-type") ?? "unknown content type";

  if (!response.ok) {
    throw new Error(circuitConfigErrorMessage(wasmUrl, `HTTP ${response.status} ${response.statusText}`.trim(), contentType));
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!hasWasmMagic(bytes)) {
    throw new Error(circuitConfigErrorMessage(wasmUrl, `leading bytes ${formatLeadingBytes(bytes)}`, contentType));
  }
}

function buildCloakCircuitWasmUrl(circuitsBaseUrl: string): string {
  return `${stripTrailingSlash(circuitsBaseUrl)}/${CLOAK_CIRCUIT_WASM_PATH}`;
}

function circuitConfigErrorMessage(wasmUrl: string, detail: string, contentType: string): string {
  return `Cloak circuit WASM is unavailable at ${wasmUrl} (${detail}, ${contentType}). Configure NEXT_PUBLIC_CLOAK_CIRCUITS_URL with a base URL containing transaction_js/transaction.wasm and transaction_final.zkey.`;
}

function normalizeCloakExecutionError(error: unknown, circuitsBaseUrl: string): Error {
  const message = formatCause(error);
  if (/WebAssembly\.compile\(\): expected magic word/i.test(message)) {
    return new Error(circuitConfigErrorMessage(buildCloakCircuitWasmUrl(circuitsBaseUrl), message, "unexpected response body"));
  }

  return error instanceof Error ? error : new Error(message);
}

function hasWasmMagic(bytes: Uint8Array): boolean {
  return CLOAK_CIRCUIT_WASM_MAGIC.every((byte, index) => bytes[index] === byte);
}

function formatLeadingBytes(bytes: Uint8Array): string {
  return Array.from(bytes.slice(0, 8))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join(" ");
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function formatCause(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getOptionalPublicEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}
