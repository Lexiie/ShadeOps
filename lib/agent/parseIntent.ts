import { google } from "@ai-sdk/google";
import { generateObject } from "ai";
import { parsedPayoutOperationSchema, type ParsedPayoutOperation, type PayoutIntent } from "@/lib/schemas/payout";

const DEFAULT_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

/**
 * Parses a payout intent into a validated operation draft without granting execution authority.
 */
export async function parsePayoutIntent(intent: PayoutIntent): Promise<ParsedPayoutOperation> {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return parsePayoutIntentDeterministically(intent);
  }

  try {
    const { object } = await generateObject({
      model: google("gemini-2.5-flash"),
      schema: parsedPayoutOperationSchema,
      system: [
        "You parse treasury payout requests into structured JSON for an admin review workflow.",
        "You are advisory only: never claim a payout is approved, executed, or safe.",
        "Extract only facts present in the request. If a recipient wallet is not present, omit recipientWallet.",
        "Use decimal strings for amount. Keep reason concise, for example Bounty payout, Vendor payout, Grant payout, or Contributor payout.",
        "For USDC on Solana, use token mint EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v. For native SOL, omit tokenMint."
      ].join(" "),
      prompt: `Treasury wallet: ${intent.treasuryWallet}\nPayout request: ${intent.rawText}`
    });

    return normalizeParsedOperation(object, intent);
  } catch (error) {
    console.warn("Gemini intent parsing failed; using deterministic fallback.", error);
    return parsePayoutIntentDeterministically(intent);
  }
}

/**
 * Parses a payout intent locally so demos and tests do not require an AI provider key.
 */
export function parsePayoutIntentDeterministically(intent: PayoutIntent): ParsedPayoutOperation {
  const amountMatch = intent.rawText.match(/(\d+(?:\.\d+)?)\s*(USDC|SOL|BONK)?/i);
  const recipientMatch = intent.rawText.match(/pay\s+([a-z0-9_.-]+)/i);
  const reason = inferReason(intent.rawText);

  return normalizeParsedOperation({
    recipientLabel: recipientMatch?.[1] ?? "Unresolved recipient",
    tokenSymbol: amountMatch?.[2]?.toUpperCase() ?? "USDC",
    tokenMint: amountMatch?.[2]?.toUpperCase() === "SOL" ? undefined : DEFAULT_USDC_MINT,
    amount: amountMatch?.[1] ?? "0",
    reason,
    privacyRequested: /private|privately|cloak|umbra/i.test(intent.rawText)
  }, intent);
}

/**
 * Applies deterministic defaults and schema validation after AI or fallback parsing.
 */
function normalizeParsedOperation(operation: ParsedPayoutOperation, intent: PayoutIntent): ParsedPayoutOperation {
  const tokenSymbol = operation.tokenSymbol.toUpperCase();
  const tokenMint = tokenSymbol === "SOL" ? undefined : operation.tokenMint ?? defaultMintForToken(tokenSymbol);

  return parsedPayoutOperationSchema.parse({
    ...operation,
    recipientLabel: operation.recipientLabel.trim() || "Unresolved recipient",
    tokenSymbol,
    tokenMint,
    amount: operation.amount,
    reason: operation.reason.trim() || inferReason(intent.rawText),
    privacyRequested: operation.privacyRequested ?? /private|privately|cloak|umbra/i.test(intent.rawText)
  });
}

/**
 * Returns known token mints for tokens supported by the policy demo.
 */
function defaultMintForToken(tokenSymbol: string): string | undefined {
  if (tokenSymbol === "USDC") {
    return DEFAULT_USDC_MINT;
  }

  return undefined;
}

/**
 * Infers a concise payout reason from natural-language intent text.
 */
export function inferReason(rawText: string): string {
  if (/bounty/i.test(rawText)) {
    return "Bounty payout";
  }

  if (/payroll|salary|contractor/i.test(rawText)) {
    return "Payroll or contractor payout";
  }

  if (/vendor|invoice/i.test(rawText)) {
    return "Vendor payout";
  }

  if (/grant/i.test(rawText)) {
    return "Grant payout";
  }

  return "Contributor payout";
}
