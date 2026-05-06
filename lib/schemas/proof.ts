import { z } from "zod";
import { parsedPayoutOperationSchema } from "./payout";
import { policyResultSchema } from "./policy";
import { privacyRouteDecisionSchema } from "./route";

export const executionReferenceSchema = z.object({
  protocol: z.enum(["umbra", "cloak"]),
  signature: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{64,128}$/, "Execution reference must contain a valid base58 Solana signature."),
  label: z.string().min(1).max(80),
  metadata: z.record(z.union([z.string(), z.number(), z.boolean()])).default({})
});

export const executionPlanSchema = z.object({
  operationId: z.string(),
  parsedOperation: parsedPayoutOperationSchema,
  policyResult: policyResultSchema,
  routeDecision: privacyRouteDecisionSchema,
  requiresAdminSignature: z.literal(true),
  steps: z.array(z.string()),
  transactionPreparationStatus: z.enum(["not_prepared", "ready_for_signature", "blocked"])
});

export const proofPackageSchema = z.object({
  operationId: z.string(),
  timestamp: z.string(),
  parsedOperation: parsedPayoutOperationSchema,
  policyResult: policyResultSchema,
  routeDecision: privacyRouteDecisionSchema,
  adminApprovalTimestamp: z.string(),
  executionReferences: z.array(executionReferenceSchema).min(1),
  decisionHash: z.string()
});

export type ExecutionPlan = z.infer<typeof executionPlanSchema>;
export type ExecutionReference = z.infer<typeof executionReferenceSchema>;
export type ProofPackage = z.infer<typeof proofPackageSchema>;
