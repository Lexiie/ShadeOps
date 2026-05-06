import type { ExecutionPlan } from "@/lib/schemas/proof";

/**
 * Creates advisory explanation copy for the admin review surface.
 */
export function explainDecision(plan: ExecutionPlan): string {
  const authority = "The parser is advisory; deterministic policy and admin signing control execution.";
  const route = `Recommended route is ${plan.routeDecision.mode.toUpperCase()} because ${plan.routeDecision.explanation}`;
  const policy = `Policy status is ${plan.policyResult.status.replace("_", " ")}.`;

  return `${policy} ${route}. ${authority}`;
}
