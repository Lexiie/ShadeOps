import type { ExecutionPlan, ExecutionReference } from "@/lib/schemas/proof";
import { decimalToBaseUnits, solToLamports } from "@/lib/privacy/amounts";
import { decimalsForToken } from "@/lib/tokens";

/**
 * Ensures browser-reported execution references belong to the reviewed plan.
 * On-chain transaction inspection is still required for full production proof.
 */
export function validateExecutionReferencesForPlan(plan: ExecutionPlan, references: ExecutionReference[]): void {
  const signatures = new Set<string>();

  for (const reference of references) {
    if (reference.protocol !== plan.routeDecision.mode) {
      throw new Error("Execution reference protocol does not match the approved route.");
    }

    if (reference.metadata.operationId !== plan.operationId) {
      throw new Error("Execution reference operation id does not match the approved plan.");
    }

    if (reference.metadata.recipient && reference.metadata.recipient !== plan.parsedOperation.recipientWallet) {
      throw new Error("Execution reference recipient does not match the approved plan.");
    }

    if (reference.metadata.tokenMint && reference.metadata.tokenMint !== plan.parsedOperation.tokenMint) {
      throw new Error("Execution reference token mint does not match the approved plan.");
    }

    if (reference.metadata.amountLamports && plan.parsedOperation.tokenSymbol === "SOL" && reference.metadata.amountLamports !== solToLamports(plan.parsedOperation.amount).toString()) {
      throw new Error("Execution reference amount does not match the approved plan.");
    }

    if (reference.metadata.amountBaseUnits && reference.metadata.amountBaseUnits !== decimalToBaseUnits(plan.parsedOperation.amount, decimalsForToken(plan.parsedOperation.tokenSymbol)).toString()) {
      throw new Error("Execution reference amount does not match the approved plan.");
    }

    if (signatures.has(reference.signature)) {
      throw new Error("Duplicate execution references are not allowed.");
    }

    signatures.add(reference.signature);
  }
}
