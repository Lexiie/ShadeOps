import { NextResponse } from "next/server";
import { requireWorkspaceRoleForRequest } from "@/lib/auth/workspace";
import { treasuryConfigInputSchema } from "@/lib/schemas/treasury";
import { getTreasuryConfigForWorkspace, saveTreasuryConfigForWorkspace } from "@/lib/treasury/configStore";

/**
 * Returns the workspace treasury configuration used by payout planning.
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const access = await requireWorkspaceRoleForRequest(request, ["owner", "admin", "reviewer"]);

    return NextResponse.json({ treasuryConfig: await getTreasuryConfigForWorkspace(access.workspaceId) });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Unauthorized." }, { status: 401 });
  }
}

/**
 * Saves the workspace treasury configuration used by payout planning.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const access = await requireWorkspaceRoleForRequest(request, ["owner", "admin"]);
    const treasuryConfig = await saveTreasuryConfigForWorkspace(treasuryConfigInputSchema.parse(await request.json()), access.workspaceId);

    return NextResponse.json({ treasuryConfig }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Unable to save treasury config." }, { status: 400 });
  }
}
