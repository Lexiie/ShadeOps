import { randomUUID } from "node:crypto";
import type { ParsedPayoutOperation } from "@/lib/schemas/payout";
import type { PolicyResult } from "@/lib/schemas/policy";
import { type ExecutionPlan, executionPlanSchema } from "@/lib/schemas/proof";
import type { PrivacyRouteDecision } from "@/lib/schemas/route";

/**
 * Creates an immutable admin-review execution plan from deterministic decisions.
 */
export function createExecutionPlan(parsedOperation: ParsedPayoutOperation, policyResult: PolicyResult, routeDecision: PrivacyRouteDecision): ExecutionPlan {
  const isBlocked = policyResult.status === "blocked";

  return executionPlanSchema.parse({
    operationId: randomUUID(),
    parsedOperation,
    policyResult,
    routeDecision,
    requiresAdminSignature: true,
    transactionPreparationStatus: isBlocked ? "blocked" : "ready_for_signature",
    steps: createPlanSteps(routeDecision.mode, isBlocked)
  });
}

/**
 * Creates human-readable execution steps for admin review.
 */
export function createPlanSteps(mode: "umbra" | "cloak", isBlocked: boolean): string[] {
  if (isBlocked) {
    return ["Resolve blocked policy rules before transaction preparation."];
  }

  return [
    "Admin reviews parsed payout operation.",
    "Admin confirms deterministic policy result.",
    `ShadeOps prepares ${mode.toUpperCase()} private payout instructions.`,
    "Admin approves the plan.",
    "Connected wallet signs the transaction.",
    "ShadeOps records execution references and proof package."
  ];
}
