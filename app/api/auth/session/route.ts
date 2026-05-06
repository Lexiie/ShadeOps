import { NextResponse } from "next/server";
import { getWalletSession } from "@/lib/auth/session";

/**
 * Returns the current wallet auth session, if any.
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ session: await getWalletSession() });
}
