import { Connection, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress, getMint, getAccount } from "@solana/spl-token";
import { decimalToBaseUnits, solToLamports } from "@/lib/privacy/amounts";
import { type BalanceVerification, type ParsedPayoutOperation, type TreasuryContext, balanceVerificationSchema } from "@/lib/schemas/payout";

/**
 * Verifies exact spendable balance using Solana RPC for SOL and SPL tokens.
 */
export async function verifyExactBalance(operation: ParsedPayoutOperation, treasuryContext: TreasuryContext): Promise<BalanceVerification> {
  const rpcUrl = process.env.SOLANA_RPC_URL;

  if (!rpcUrl) {
    throw new Error("SOLANA_RPC_URL is required for exact balance verification.");
  }

  if (operation.tokenSymbol === "SOL") {
    return verifySolBalance(operation, treasuryContext.treasuryWallet, rpcUrl);
  }

  if (!operation.tokenMint) {
    throw new Error(`Token mint is required to verify ${operation.tokenSymbol} balance.`);
  }

  return verifySplTokenBalance(operation, treasuryContext.treasuryWallet, rpcUrl);
}

/**
 * Verifies an SPL token balance by reading the treasury's associated token account.
 */
export async function verifySplTokenBalance(operation: ParsedPayoutOperation, treasuryWallet: string, rpcUrl: string): Promise<BalanceVerification> {
  const connection = new Connection(rpcUrl, "confirmed");
  const owner = new PublicKey(treasuryWallet);
  const mint = new PublicKey(operation.tokenMint ?? "");
  const ata = await getAssociatedTokenAddress(mint, owner, true);
  const [mintInfo, accountInfo] = await Promise.all([getMint(connection, mint), getAccount(connection, ata)]);
  const spendableAmount = formatBaseUnits(accountInfo.amount, mintInfo.decimals);
  const requestedAmount = decimalToBaseUnits(operation.amount, mintInfo.decimals);

  return balanceVerificationSchema.parse({
    tokenSymbol: operation.tokenSymbol,
    tokenMint: operation.tokenMint,
    requestedAmount: operation.amount,
    spendableAmount,
    sufficient: accountInfo.amount >= requestedAmount,
    checkedAt: new Date().toISOString()
  });
}

/**
 * Verifies native SOL balance through a configured Solana RPC endpoint.
 */
export async function verifySolBalance(operation: ParsedPayoutOperation, treasuryWallet: string, rpcUrl: string): Promise<BalanceVerification> {
  const connection = new Connection(rpcUrl, "confirmed");
  const lamports = await connection.getBalance(new PublicKey(treasuryWallet));
  const spendableAmount = formatBaseUnits(BigInt(lamports), 9);
  const requestedLamports = solToLamports(operation.amount);

  return balanceVerificationSchema.parse({
    tokenSymbol: operation.tokenSymbol,
    tokenMint: operation.tokenMint,
    requestedAmount: operation.amount,
    spendableAmount,
    sufficient: BigInt(lamports) >= requestedLamports,
    checkedAt: new Date().toISOString()
  });
}

/**
 * Formats integer base units into a decimal token amount without floating point math.
 */
export function formatBaseUnits(amount: bigint, decimals: number): string {
  const raw = amount.toString().padStart(decimals + 1, "0");
  const whole = raw.slice(0, -decimals) || "0";
  const fraction = decimals > 0 ? raw.slice(-decimals).replace(/0+$/, "") : "";

  return fraction ? `${whole}.${fraction}` : whole;
}
