import { describe, expect, it } from "vitest";
import { evaluatePolicy } from "@/lib/policy/evaluatePolicy";
import type { BalanceVerification, ParsedPayoutOperation, TreasuryContext } from "@/lib/schemas/payout";

const operation: ParsedPayoutOperation = {
  recipientLabel: "Alice",
  recipientWallet: "RecipientWallet1111111111111111111111111111111",
  tokenSymbol: "USDC",
  tokenMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  amount: "50",
  reason: "Bounty payout",
  privacyRequested: true
};

const treasuryContext: TreasuryContext = {
  treasuryWallet: "ShadeTreasury1111111111111111111111111111111",
  source: "zerion-cli",
  summary: "Demo context",
  holdings: [{ symbol: "USDC", balance: "5000", spendable: "5000" }],
  recentTransactions: [],
  topPositions: [],
  recentOutflowUsd: 0,
  observedAt: new Date().toISOString()
};

const balance: BalanceVerification = {
  tokenSymbol: "USDC",
  tokenMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  requestedAmount: "50",
  spendableAmount: "5000",
  sufficient: true,
  checkedAt: new Date().toISOString()
};

describe("evaluatePolicy", () => {
  it("passes a safe payout", () => {
    expect(evaluatePolicy(operation, treasuryContext, balance).status).toBe("pass");
  });

  it("blocks insufficient balance", () => {
    expect(evaluatePolicy(operation, treasuryContext, { ...balance, spendableAmount: "10", sufficient: false }).status).toBe("blocked");
  });

  it("blocks disallowed tokens", () => {
    expect(evaluatePolicy({ ...operation, tokenSymbol: "RUG" }, treasuryContext, balance).status).toBe("blocked");
  });

  it("requires manual review for SOL amounts without a fiat price feed", () => {
    expect(evaluatePolicy({ ...operation, tokenSymbol: "SOL", tokenMint: undefined, amount: "0.5" }, treasuryContext, { ...balance, tokenSymbol: "SOL", tokenMint: undefined }).status).toBe("needs_review");
  });
});
