import { describe, expect, it } from "vitest";
import { buildAgentAdvisory } from "@/lib/agent/buildAdvisory";
import { createExecutionPlan } from "@/lib/execution/createExecutionPlan";
import { selectPrivacyRoute } from "@/lib/routes/selectPrivacyRoute";
import type { RecipientResolution } from "@/lib/schemas/contact";
import type { ParsedPayoutOperation } from "@/lib/schemas/payout";
import type { PolicyResult } from "@/lib/schemas/policy";

const operation: ParsedPayoutOperation = {
  recipientLabel: "Alice",
  tokenSymbol: "USDC",
  tokenMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  amount: "50",
  reason: "Bounty payout",
  privacyRequested: true
};

const policyResult: PolicyResult = {
  status: "needs_review",
  ruleResults: [{ ruleId: "recipient.resolution", status: "needs_review", message: "Recipient wallet is missing and must be resolved by the admin." }]
};

const recipientResolution: RecipientResolution = {
  status: "unresolved",
  source: "manual_required",
  label: "Alice",
  message: "No active address book match found for Alice."
};

describe("buildAgentAdvisory", () => {
  it("asks for missing recipient wallets without granting authority", () => {
    const plan = createExecutionPlan(operation, policyResult, selectPrivacyRoute(operation));
    const advisory = buildAgentAdvisory(plan, recipientResolution);

    expect(advisory.questions.join(" ")).toContain("Which wallet should be used for Alice?");
    expect(advisory.nextAction).toContain("Resolve the recipient wallet");
    expect(advisory.authorityBoundary).toContain("advisory");
  });
});
