"use client";

import type { PrivacyExecutionReference, PrivacyExecutionRequest } from "./types";

/**
 * Dispatches payout execution to the selected real privacy protocol SDK.
 */
export async function executePrivacyPayout(request: PrivacyExecutionRequest): Promise<PrivacyExecutionReference[]> {
  if (request.plan.policyResult.status === "blocked") {
    throw new Error("Blocked plans cannot be executed.");
  }

  if (request.plan.routeDecision.mode === "cloak") {
    const { executeCloakPayout } = await import("./cloakClient");

    return executeCloakPayout(request);
  }

  const { executeUmbraPayout } = await import("./umbraClient");

  return executeUmbraPayout(request);
}
