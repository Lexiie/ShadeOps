import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyWalletChallenge } from "@/lib/auth/session";

const verifyRequestSchema = z.object({
  walletAddress: z.string().min(32),
  signature: z.string().min(32)
});

/**
 * Verifies a signed wallet challenge and creates a server-side session cookie.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { walletAddress, signature } = verifyRequestSchema.parse(await request.json());
    const session = await verifyWalletChallenge(walletAddress, signature);

    return NextResponse.json({ session });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Unable to verify wallet signature." }, { status: 401 });
  }
}
