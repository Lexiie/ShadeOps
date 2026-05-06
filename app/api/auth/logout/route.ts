import { NextResponse } from "next/server";
import { clearWalletSession } from "@/lib/auth/session";

/**
 * Clears the wallet auth session cookies.
 */
export async function POST(): Promise<NextResponse> {
  await clearWalletSession();

  return NextResponse.json({ ok: true });
}
