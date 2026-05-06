import { NextResponse } from "next/server";
import { z } from "zod";
import { createWalletChallenge } from "@/lib/auth/session";

const challengeRequestSchema = z.object({ walletAddress: z.string().min(32) });

/**
 * Creates a wallet sign-in challenge for the connected admin wallet.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { walletAddress } = challengeRequestSchema.parse(await request.json());

    return NextResponse.json(await createWalletChallenge(walletAddress));
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Unable to create wallet challenge." }, { status: 400 });
  }
}
