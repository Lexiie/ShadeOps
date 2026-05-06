import { z } from "zod";

export const payoutIntentSchema = z.object({
  rawText: z.string().min(8, "Describe the payout intent."),
  treasuryWallet: z.string().min(32, "Provide a treasury wallet address.")
});

export const parsedPayoutOperationSchema = z.object({
  recipientLabel: z.string().min(1),
  recipientWallet: z.string().min(32).optional(),
  tokenSymbol: z.string().min(2).max(12).default("USDC"),
  tokenMint: z.string().min(32).optional(),
  amount: z.string().regex(/^\d+(\.\d+)?$/, "Amount must be a positive decimal string."),
  reason: z.string().min(3),
  privacyRequested: z.boolean().default(true)
});

export const treasuryContextSchema = z.object({
  treasuryWallet: z.string(),
  source: z.enum(["zerion-cli", "zerion-api"]),
  summary: z.string(),
  portfolioValueUsd: z.number().nonnegative().optional(),
  portfolioChangeUsd1d: z.number().optional(),
  portfolioChangePercent1d: z.number().optional(),
  holdings: z.array(
    z.object({
      symbol: z.string(),
      balance: z.string(),
      spendable: z.string(),
      valueUsd: z.number().nonnegative().optional(),
      chain: z.string().optional(),
      positionType: z.string().optional()
    })
  ),
  recentTransactions: z
    .array(
      z.object({
        hash: z.string(),
        direction: z.enum(["in", "out", "self", "unknown"]),
        valueUsd: z.number().nonnegative().optional(),
        description: z.string().optional(),
        minedAt: z.string().optional()
      })
    )
    .default([]),
  topPositions: z
    .array(
      z.object({
        symbol: z.string(),
        balance: z.string(),
        valueUsd: z.number().nonnegative().optional(),
        chain: z.string().optional()
      })
    )
    .default([]),
  recentOutflowUsd: z.number().nonnegative(),
  observedAt: z.string()
});

export const balanceVerificationSchema = z.object({
  tokenSymbol: z.string(),
  tokenMint: z.string().optional(),
  requestedAmount: z.string(),
  spendableAmount: z.string(),
  sufficient: z.boolean(),
  checkedAt: z.string()
});

export type PayoutIntent = z.infer<typeof payoutIntentSchema>;
export type ParsedPayoutOperation = z.infer<typeof parsedPayoutOperationSchema>;
export type TreasuryContext = z.infer<typeof treasuryContextSchema>;
export type BalanceVerification = z.infer<typeof balanceVerificationSchema>;
