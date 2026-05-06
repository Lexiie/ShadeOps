import { NextResponse } from "next/server";
import { saveProofRecord, listProofRecordsForWorkspace } from "@/lib/audit/payoutAuditStore";
import { requireWorkspaceRoleForRequest } from "@/lib/auth/workspace";
import { createProofPackage } from "@/lib/proof/createProofPackage";
import { validateExecutionReferencesForPlan } from "@/lib/proof/validateExecutionReferences";
import { verifyExecutionReferencesOnChain } from "@/lib/proof/verifyExecutionReferences";
import { type ExecutionReference, executionPlanSchema, executionReferenceSchema } from "@/lib/schemas/proof";

/**
 * Generates a proof package after the client reports real privacy protocol execution references.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const access = await requireWorkspaceRoleForRequest(request, ["owner", "admin"]);
    const body = await request.json();
    const plan = executionPlanSchema.parse(body.executionPlan);
    const executionReferences = parseExecutionReferences(body.executionReferences);

    if (plan.policyResult.status === "blocked") {
      return NextResponse.json({ message: "Blocked plans cannot generate proof packages." }, { status: 409 });
    }

    if (executionReferences.length === 0) {
      return NextResponse.json({ message: "At least one real execution reference is required." }, { status: 400 });
    }

    validateExecutionReferencesForPlan(plan, executionReferences);
    await verifyExecutionReferencesOnChain(executionReferences, { expectedSigner: access.walletAddress, expectedPlan: plan });

    const adminApprovalTimestamp = body.adminApprovalTimestamp ?? new Date().toISOString();
    const proofPackage = createProofPackage(plan, adminApprovalTimestamp, executionReferences);
    await saveProofRecord({ workspaceId: access.workspaceId, proofPackage, adminWallet: access.walletAddress });

    return NextResponse.json({ proofPackage });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Unable to create proof package." }, { status: 400 });
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const access = await requireWorkspaceRoleForRequest(request, ["owner", "admin", "reviewer"]);
    return NextResponse.json({ proofRecords: await listProofRecordsForWorkspace(access.workspaceId) });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Unable to list proof records." }, { status: 400 });
  }
}

/**
 * Validates execution references supplied by the browser-side protocol SDK.
 */
function parseExecutionReferences(value: unknown): ExecutionReference[] {
  return executionReferenceSchema.array().parse(value);
}
