import type { RecipientResolution } from "@/lib/schemas/contact";
import type { ExecutionPlan } from "@/lib/schemas/proof";
import { agentAdvisorySchema, type AgentAdvisory } from "@/lib/schemas/agent";

/**
 * Builds bounded agent guidance from deterministic plan outputs.
 */
export function buildAgentAdvisory(plan: ExecutionPlan, recipientResolution: RecipientResolution): AgentAdvisory {
  const questions = buildQuestions(plan, recipientResolution);
  const suggestions = buildSuggestions(plan, recipientResolution);
  const nextAction = buildNextAction(plan, recipientResolution);

  return agentAdvisorySchema.parse({
    summary: buildSummary(plan),
    questions,
    suggestions,
    nextAction,
    authorityBoundary: "Agent guidance is advisory. Policy checks, wallet resolution, and admin wallet signatures remain authoritative."
  });
}

/**
 * Summarizes what the agent believes the admin should inspect first.
 */
function buildSummary(plan: ExecutionPlan): string {
  const status = plan.policyResult.status.replace("_", " ");
  const route = plan.routeDecision.mode.toUpperCase();

  return `Drafted ${plan.parsedOperation.amount} ${plan.parsedOperation.tokenSymbol} for ${plan.parsedOperation.recipientLabel}. Policy is ${status}; recommended private route is ${route}.`;
}

/**
 * Creates clarifying questions only where deterministic data is incomplete or risky.
 */
function buildQuestions(plan: ExecutionPlan, recipientResolution: RecipientResolution): string[] {
  const questions: string[] = [];

  if (recipientResolution.status === "unresolved") {
    questions.push(`Which wallet should be used for ${recipientResolution.label}? Add or activate this recipient in the dashboard address book.`);
  }

  if (plan.policyResult.status === "needs_review") {
    questions.push("Do the review-required policy rules match the team's expected payout policy for this operation?");
  }

  if (plan.policyResult.status === "blocked") {
    questions.push("Which blocked rule should be fixed before a transaction is prepared?");
  }

  if (!plan.parsedOperation.privacyRequested) {
    questions.push("Should this payout use a private route, or is a transparent transfer intentional?");
  }

  return questions;
}

/**
 * Suggests safe operator actions without changing plan authority.
 */
function buildSuggestions(plan: ExecutionPlan, recipientResolution: RecipientResolution): string[] {
  const suggestions: string[] = [];

  if (recipientResolution.status === "resolved") {
    suggestions.push(recipientResolution.message);
  }

  suggestions.push(`Review ${plan.routeDecision.mode.toUpperCase()} route fit: ${plan.routeDecision.explanation}`);

  for (const rule of plan.policyResult.ruleResults.filter((item) => item.status !== "pass")) {
    suggestions.push(`${rule.ruleId}: ${rule.message}`);
  }

  if (suggestions.length === 1 && plan.policyResult.status === "pass") {
    suggestions.push("All deterministic policy rules passed. Admin signature is still required before execution.");
  }

  return suggestions;
}

/**
 * Names the safest next operator step.
 */
function buildNextAction(plan: ExecutionPlan, recipientResolution: RecipientResolution): string {
  if (recipientResolution.status === "unresolved") {
    return "Resolve the recipient wallet in the dashboard address book before signing.";
  }

  if (plan.policyResult.status === "blocked") {
    return "Fix blocked policy rules; transaction preparation must remain disabled.";
  }

  if (plan.policyResult.status === "needs_review") {
    return "Complete manual policy review, then decide whether admin signing should proceed.";
  }

  return "Review the resolved wallet and route, then proceed to admin approval only if everything matches intent.";
}
