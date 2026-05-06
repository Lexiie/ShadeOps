import { createHash } from "node:crypto";
import type { ExecutionPlan } from "@/lib/schemas/proof";

/**
 * Hashes the core plan decision fields so proof packages detect decision drift.
 */
export function hashDecision(plan: ExecutionPlan): string {
  const payload = JSON.stringify({
    operationId: plan.operationId,
    parsedOperation: plan.parsedOperation,
    policyResult: plan.policyResult,
    routeDecision: plan.routeDecision,
    requiresAdminSignature: plan.requiresAdminSignature
  });

  return createHash("sha256").update(payload).digest("hex");
}
