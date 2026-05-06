import type { BalanceVerification, ParsedPayoutOperation, TreasuryContext } from "@/lib/schemas/payout";
import { type PolicyResult, type PolicyStatus, policyResultSchema } from "@/lib/schemas/policy";
import { checkAllowedToken, checkAmountLimit, checkBalanceSufficiency, checkRecentOutflow, checkRecipientResolution } from "./rules";

/**
 * Evaluates deterministic payout policy and returns the authoritative policy status.
 */
export function evaluatePolicy(operation: ParsedPayoutOperation, treasuryContext: TreasuryContext, balance: BalanceVerification): PolicyResult {
  const ruleResults = [
    checkAllowedToken(operation),
    checkAmountLimit(operation),
    checkRecipientResolution(operation),
    checkBalanceSufficiency(balance),
    checkRecentOutflow(treasuryContext)
  ];

  return policyResultSchema.parse({
    status: summarizePolicyStatus(ruleResults.map((rule) => rule.status)),
    ruleResults
  });
}

/**
 * Collapses rule-level statuses into the final policy status.
 */
export function summarizePolicyStatus(statuses: PolicyStatus[]): PolicyStatus {
  if (statuses.includes("blocked")) {
    return "blocked";
  }

  if (statuses.includes("needs_review")) {
    return "needs_review";
  }

  return "pass";
}
