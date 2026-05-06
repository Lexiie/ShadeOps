import type { ParsedPayoutOperation } from "@/lib/schemas/payout";
import { type PrivacyRouteDecision, privacyRouteDecisionSchema } from "@/lib/schemas/route";

/**
 * Selects a deterministic privacy route based on payout category and proof needs.
 */
export function selectPrivacyRoute(operation: ParsedPayoutOperation): PrivacyRouteDecision {
  if (/payroll|contractor|vendor|invoice/i.test(operation.reason)) {
    return privacyRouteDecisionSchema.parse({
      mode: "cloak",
      reasonCode: "AUDIT_FRIENDLY_PRIVATE_PAYOUT",
      explanation: "payroll and vendor flows benefit from an audit-friendly private payment framing",
      tradeoffs: ["Better for operational review", "More formal proof-package expectations"]
    });
  }

  return privacyRouteDecisionSchema.parse({
    mode: "umbra",
    reasonCode: "CLAIMABLE_CONTRIBUTOR_PAYOUT",
    explanation: "contributor and bounty payouts fit a claimable private recipient flow",
    tradeoffs: ["Simple recipient claim flow", "Best for discrete bounty or contributor payments"]
  });
}
