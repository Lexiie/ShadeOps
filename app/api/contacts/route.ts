import { NextResponse } from "next/server";
import { requireWorkspaceRoleForRequest } from "@/lib/auth/workspace";
import { listContactsForWorkspace, upsertContactForWorkspace } from "@/lib/contacts/store";
import { contactInputSchema } from "@/lib/schemas/contact";

/**
 * Lists contacts available to the recipient resolver.
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const access = await requireWorkspaceRoleForRequest(request, ["owner", "admin", "reviewer"]);

    return NextResponse.json({ contacts: await listContactsForWorkspace(access.workspaceId) });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Unauthorized." }, { status: 401 });
  }
}

/**
 * Adds or updates a dashboard contact for the running app process.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const access = await requireWorkspaceRoleForRequest(request, ["owner", "admin"]);
    const contact = await upsertContactForWorkspace(contactInputSchema.parse(await request.json()), access.workspaceId);

    return NextResponse.json({ contact }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Unable to save contact." }, { status: 400 });
  }
}
