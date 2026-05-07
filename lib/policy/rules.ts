import type { BalanceVerification, ParsedPayoutOperation, TreasuryContext } from "@/lib/schemas/payout";
import type { PolicyRuleResult } from "@/lib/schemas/policy";
import { isKnownTokenSymbol } from "@/lib/tokens";

const REVIEW_THRESHOLD_USD = 1000;
const BLOCK_THRESHOLD_USD = 10000;
const ABNORMAL_OUTFLOW_USD = 5000;
const SOL_REVIEW_THRESHOLD = 0;
const SOL_BLOCK_THRESHOLD = 100;

/**
 * Checks whether the payout token is allowed by ShadeOps demo policy.
 */
export function checkAllowedToken(operation: ParsedPayoutOperation): PolicyRuleResult {
  if (!isKnownTokenSymbol(operation.tokenSymbol)) {
    return {
      ruleId: "token.allowlist",
      status: "blocked",
      message: `${operation.tokenSymbol} is not in the allowed token list.`
    };
  }

  return {
    ruleId: "token.allowlist",
    status: "pass",
    message: `${operation.tokenSymbol} is allowed for demo payouts.`
  };
}

/**
 * Checks amount thresholds that require review or block execution.
 */
export function checkAmountLimit(operation: ParsedPayoutOperation): PolicyRuleResult {
  const amount = Number(operation.amount);
  const tokenSymbol = operation.tokenSymbol.toUpperCase();

  if (!Number.isFinite(amount) || amount <= 0) {
    return {
      ruleId: "amount.limit",
      status: "blocked",
      message: "Requested amount must be a positive finite value."
    };
  }

  if (tokenSymbol === "SOL") {
    if (amount > SOL_BLOCK_THRESHOLD) {
      return {
        ruleId: "amount.limit",
        status: "blocked",
        message: `Requested SOL amount ${operation.amount} exceeds the hard block threshold.`
      };
    }

    if (amount > SOL_REVIEW_THRESHOLD) {
      return {
        ruleId: "amount.limit",
        status: "needs_review",
        message: "SOL payouts require manual treasury review because no fiat price feed is wired into policy."
      };
    }
  }

  if (amount > BLOCK_THRESHOLD_USD) {
    return {
      ruleId: "amount.limit",
      status: "blocked",
      message: `Requested amount ${operation.amount} exceeds the hard block threshold.`
    };
  }

  if (amount > REVIEW_THRESHOLD_USD) {
    return {
      ruleId: "amount.limit",
      status: "needs_review",
      message: `Requested amount ${operation.amount} requires manual treasury review.`
    };
  }

  return {
    ruleId: "amount.limit",
    status: "pass",
    message: `Requested amount ${operation.amount} is within the standard limit.`
  };
}

/**
 * Checks whether the treasury has enough verified spendable balance.
 */
export function checkBalanceSufficiency(balance: BalanceVerification): PolicyRuleResult {
  if (!balance.sufficient) {
    return {
      ruleId: "balance.sufficiency",
      status: "blocked",
      message: `Spendable ${balance.tokenSymbol} balance ${balance.spendableAmount} is below requested amount ${balance.requestedAmount}.`
    };
  }

  return {
    ruleId: "balance.sufficiency",
    status: "pass",
    message: `Spendable ${balance.tokenSymbol} balance covers the payout.`
  };
}

/**
 * Checks whether recent outflows are high enough to require review.
 */
export function checkRecentOutflow(treasuryContext: TreasuryContext): PolicyRuleResult {
  if (treasuryContext.recentOutflowUsd > ABNORMAL_OUTFLOW_USD) {
    return {
      ruleId: "treasury.recent_outflow",
      status: "needs_review",
      message: `Recent outflow is ${treasuryContext.recentOutflowUsd} USD, which requires review before signing.`
    };
  }

  return {
    ruleId: "treasury.recent_outflow",
    status: "pass",
    message: "Recent outflow is within the expected operating range."
  };
}

/**
 * Checks whether a recipient wallet was resolved before execution planning.
 */
export function checkRecipientResolution(operation: ParsedPayoutOperation): PolicyRuleResult {
  if (!operation.recipientWallet) {
    return {
      ruleId: "recipient.resolution",
      status: "needs_review",
      message: "Recipient wallet is missing and must be resolved by the admin."
    };
  }

  return {
    ruleId: "recipient.resolution",
    status: "pass",
    message: "Recipient wallet is present for admin review."
  };
}
