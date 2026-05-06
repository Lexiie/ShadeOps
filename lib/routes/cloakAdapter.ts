import type { ExecutionPlan } from "@/lib/schemas/proof";

/**
 * Rejects fake Cloak execution references; use browser-side Cloak SDK execution instead.
 */
export function prepareCloakExecution(plan: ExecutionPlan): string {
  throw new Error(`Cloak execution for ${plan.operationId} must be performed by the connected wallet SDK client.`);
}
