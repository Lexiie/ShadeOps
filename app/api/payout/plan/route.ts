import { NextResponse } from "next/server";
import { buildAgentAdvisory } from "@/lib/agent/buildAdvisory";
import { parsePayoutIntent } from "@/lib/agent/parseIntent";
import { savePayoutOperation } from "@/lib/audit/payoutAuditStore";
import { requireWorkspaceRoleForRequest } from "@/lib/auth/workspace";
import { resolveRecipientForWorkspace } from "@/lib/contacts/store";
import { createExecutionPlan } from "@/lib/execution/createExecutionPlan";
import { evaluatePolicy } from "@/lib/policy/evaluatePolicy";
import { selectPrivacyRoute } from "@/lib/routes/selectPrivacyRoute";
import { payoutIntentSchema } from "@/lib/schemas/payout";
import { verifyExactBalance } from "@/lib/treasury/solanaBalance";
import { getTreasuryConfigForWorkspace } from "@/lib/treasury/configStore";
import { getTreasuryContext } from "@/lib/treasury/zerionCli";

/**
 * Builds a deterministic payout plan from raw admin intent without executing funds movement.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const access = await requireWorkspaceRoleForRequest(request, ["owner", "admin", "reviewer"]);
    const intent = payoutIntentSchema.parse(await request.json());
    const treasuryConfig = await getTreasuryConfigForWorkspace(access.workspaceId);

    if (!treasuryConfig) {
      throw new Error("Configure a workspace treasury before creating a payout plan.");
    }

    if (intent.treasuryWallet !== treasuryConfig.walletAddress) {
      throw new Error("Payout planning must use the treasury configured for this workspace.");
    }

    const parsedDraft = await parsePayoutIntent(intent);
    const { operation: parsedOperation, resolution: recipientResolution } = await resolveRecipientForWorkspace(parsedDraft, access.workspaceId);
    const treasuryContext = await getTreasuryContext(treasuryConfig.walletAddress);
    const balance = await verifyExactBalance(parsedOperation, treasuryContext);
    const policyResult = evaluatePolicy(parsedOperation, treasuryContext, balance);
    const routeDecision = selectPrivacyRoute(parsedOperation);
    const executionPlan = createExecutionPlan(parsedOperation, policyResult, routeDecision);
    const agentAdvisory = buildAgentAdvisory(executionPlan, recipientResolution);
    await savePayoutOperation({ workspaceId: access.workspaceId, plan: executionPlan, treasuryWallet: treasuryConfig.walletAddress, adminWallet: access.walletAddress });

    return NextResponse.json({ parsedOperation, recipientResolution, treasuryContext, balance, policyResult, routeDecision, executionPlan, agentAdvisory });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Unable to build payout plan." }, { status: 400 });
  }
}
