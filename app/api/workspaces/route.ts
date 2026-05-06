import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWalletSession } from "@/lib/auth/session";
import { createWorkspaceForWallet, getPrimaryWorkspaceForWallet } from "@/lib/workspace/store";

const createWorkspaceSchema = z.object({ name: z.string().trim().min(2).max(80) });

/**
 * Returns the signed wallet's primary workspace membership, if one exists.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const session = await requireWalletSession();

    return NextResponse.json({ membership: await getPrimaryWorkspaceForWallet(session.walletAddress) });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Unauthorized." }, { status: 401 });
  }
}

/**
 * Creates a new workspace and assigns the signed wallet as owner.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const session = await requireWalletSession();
    const { name } = createWorkspaceSchema.parse(await request.json());
    const existing = await getPrimaryWorkspaceForWallet(session.walletAddress);

    if (existing) {
      return NextResponse.json({ membership: existing }, { status: 200 });
    }

    return NextResponse.json({ membership: await createWorkspaceForWallet({ name, walletAddress: session.walletAddress }) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Unable to create workspace." }, { status: 400 });
  }
}
