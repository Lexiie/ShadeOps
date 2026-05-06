import type { ExecutionPlan } from "@/lib/schemas/proof";

/**
 * Prevents server-side fake transaction preparation; privacy SDK execution must happen in the wallet client.
 */
export function prepareTransaction(plan: ExecutionPlan): string[] {
  throw new Error(`Server-side ${plan.routeDecision.mode} preparation is disabled. Execute with the connected wallet SDK client.`);
}
