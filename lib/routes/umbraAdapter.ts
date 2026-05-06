import type { ExecutionPlan } from "@/lib/schemas/proof";

/**
 * Rejects fake Umbra execution references; use browser-side Umbra SDK execution instead.
 */
export function prepareUmbraExecution(plan: ExecutionPlan): string {
  throw new Error(`Umbra execution for ${plan.operationId} must be performed by the connected wallet SDK client.`);
}
