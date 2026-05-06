import { type ExecutionPlan, type ExecutionReference, type ProofPackage, proofPackageSchema } from "@/lib/schemas/proof";
import { hashDecision } from "./hashDecision";

/**
 * Creates a proof package after explicit admin approval and execution reference collection.
 */
export function createProofPackage(plan: ExecutionPlan, adminApprovalTimestamp: string, executionReferences: ExecutionReference[]): ProofPackage {
  return proofPackageSchema.parse({
    operationId: plan.operationId,
    timestamp: new Date().toISOString(),
    parsedOperation: plan.parsedOperation,
    policyResult: plan.policyResult,
    routeDecision: plan.routeDecision,
    adminApprovalTimestamp,
    executionReferences,
    decisionHash: hashDecision(plan)
  });
}
