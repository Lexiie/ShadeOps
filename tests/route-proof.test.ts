import { describe, expect, it } from "vitest";
import { createExecutionPlan } from "@/lib/execution/createExecutionPlan";
import { createProofPackage } from "@/lib/proof/createProofPackage";
import { hashDecision } from "@/lib/proof/hashDecision";
import { validateExecutionReferencesForPlan } from "@/lib/proof/validateExecutionReferences";
import { verifyExecutionReferencesOnChain } from "@/lib/proof/verifyExecutionReferences";
import { selectPrivacyRoute } from "@/lib/routes/selectPrivacyRoute";
import type { ParsedPayoutOperation } from "@/lib/schemas/payout";
import type { PolicyResult } from "@/lib/schemas/policy";
import type { ExecutionReference } from "@/lib/schemas/proof";

const contributorOperation: ParsedPayoutOperation = {
  recipientLabel: "Alice",
  recipientWallet: "RecipientWallet1111111111111111111111111111111",
  tokenSymbol: "USDC",
  tokenMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  amount: "50",
  reason: "Bounty payout",
  privacyRequested: true
};

const policyResult: PolicyResult = {
  status: "pass",
  ruleResults: [{ ruleId: "demo", status: "pass", message: "ok" }]
};

const executionReference: ExecutionReference = {
  protocol: "umbra",
  label: "umbra-test",
  signature: "5VfUXamX3bDrTJMNEcZ8mWwJwZ7ghUePqeycdk7a2vbn1G8prGuEhKW3bJ9o6ZpiwSUmwX5WaM3QpYi5Y1Nxk3Yp",
  metadata: { operationId: "test" }
};
const adminSigner = "4Ym2txdd8uvG8uo39Vnrqwa7fZNQWJeRaoQTSJiK67HH";
const confirmedByAdmin = { err: null, confirmationStatus: "finalized", signerAddresses: [adminSigner] };

describe("route and proof modules", () => {
  it("selects Umbra for bounty-style payouts", () => {
    expect(selectPrivacyRoute(contributorOperation).mode).toBe("umbra");
  });

  it("selects Cloak for vendor-style payouts", () => {
    expect(selectPrivacyRoute({ ...contributorOperation, reason: "Vendor payout" }).mode).toBe("cloak");
  });

  it("selects Cloak for SOL vendor-style payouts", () => {
    expect(selectPrivacyRoute({ ...contributorOperation, tokenSymbol: "SOL", tokenMint: undefined, reason: "Vendor payout" }).mode).toBe("cloak");
  });

  it("always requires admin signature in execution plans", () => {
    const plan = createExecutionPlan(contributorOperation, policyResult, selectPrivacyRoute(contributorOperation));
    expect(plan.requiresAdminSignature).toBe(true);
  });

  it("changes proof hash when core decision fields change", () => {
    const plan = createExecutionPlan(contributorOperation, policyResult, selectPrivacyRoute(contributorOperation));
    const changedPlan = { ...plan, parsedOperation: { ...plan.parsedOperation, amount: "75" } };
    expect(hashDecision(plan)).not.toBe(hashDecision(changedPlan));
  });

  it("creates proof packages with execution references", () => {
    const plan = createExecutionPlan(contributorOperation, policyResult, selectPrivacyRoute(contributorOperation));
    const proof = createProofPackage(plan, new Date().toISOString(), [{ ...executionReference, metadata: { operationId: plan.operationId } }]);
    expect(proof.executionReferences).toHaveLength(1);
  });

  it("rejects execution references from another operation", () => {
    const plan = createExecutionPlan(contributorOperation, policyResult, selectPrivacyRoute(contributorOperation));
    expect(() => validateExecutionReferencesForPlan(plan, [executionReference])).toThrow(/operation id/i);
  });

  it("rejects execution references with mismatched metadata", () => {
    const plan = createExecutionPlan(contributorOperation, policyResult, selectPrivacyRoute(contributorOperation));
    expect(() => validateExecutionReferencesForPlan(plan, [{ ...executionReference, metadata: { operationId: plan.operationId, tokenMint: "WrongMint11111111111111111111111111111111" } }])).toThrow(/token mint/i);
  });

  it("rejects unconfirmed execution signatures", async () => {
    await expect(verifyExecutionReferencesOnChain([executionReference], { fetchStatus: async () => ({ err: null, confirmationStatus: "processed" }) })).rejects.toThrow(/confirmed or finalized/i);
  });

  it("accepts finalized execution signatures", async () => {
    await expect(verifyExecutionReferencesOnChain([executionReference], { fetchStatus: async () => ({ err: null, confirmationStatus: "finalized" }) })).resolves.toBeUndefined();
  });

  it("rejects execution signatures not signed by the approving admin", async () => {
    await expect(
      verifyExecutionReferencesOnChain([executionReference], {
        expectedSigner: adminSigner,
        fetchStatus: async () => ({ ...confirmedByAdmin, signerAddresses: ["AnotherSigner1111111111111111111111111111111"] })
      })
    ).rejects.toThrow(/approving admin wallet/i);
  });

  it("accepts execution signatures signed by the approving admin", async () => {
    await expect(
      verifyExecutionReferencesOnChain([executionReference], {
        expectedSigner: adminSigner,
        fetchStatus: async () => confirmedByAdmin
      })
    ).resolves.toBeUndefined();
  });

  it("rejects Umbra signatures whose decoded transaction misses the approved mint", async () => {
    const plan = createExecutionPlan(contributorOperation, policyResult, selectPrivacyRoute(contributorOperation));

    await expect(
      verifyExecutionReferencesOnChain([{ ...executionReference, metadata: { operationId: plan.operationId, tokenMint: contributorOperation.tokenMint ?? "" } }], {
        expectedPlan: plan,
        fetchStatus: async () => ({ ...confirmedByAdmin, accountAddresses: [adminSigner] })
      })
    ).rejects.toThrow(/approved token mint/i);
  });

  it("accepts Umbra signatures whose decoded transaction references the approved mint", async () => {
    const plan = createExecutionPlan(contributorOperation, policyResult, selectPrivacyRoute(contributorOperation));

    await expect(
      verifyExecutionReferencesOnChain([{ ...executionReference, metadata: { operationId: plan.operationId, tokenMint: contributorOperation.tokenMint ?? "" } }], {
        expectedPlan: plan,
        fetchStatus: async () => ({ ...confirmedByAdmin, accountAddresses: [adminSigner, contributorOperation.tokenMint ?? ""] })
      })
    ).resolves.toBeUndefined();
  });

  it("rejects Cloak withdrawal signatures whose decoded transaction misses the approved recipient", async () => {
    const solPlan = createExecutionPlan({ ...contributorOperation, tokenSymbol: "SOL", tokenMint: undefined, reason: "Vendor payout" }, policyResult, selectPrivacyRoute({ ...contributorOperation, tokenSymbol: "SOL", tokenMint: undefined, reason: "Vendor payout" }));
    const cloakReference: ExecutionReference = { ...executionReference, protocol: "cloak", label: "cloak-full-withdraw", metadata: { operationId: solPlan.operationId, recipient: contributorOperation.recipientWallet ?? "", amountLamports: "50000000000" } };

    await expect(
      verifyExecutionReferencesOnChain([cloakReference], {
        expectedPlan: solPlan,
        fetchStatus: async () => ({ ...confirmedByAdmin, accountAddresses: [adminSigner] })
      })
    ).rejects.toThrow(/approved recipient/i);
  });
});
