import { NextResponse } from "next/server";
import { getTreasuryContext } from "@/lib/treasury/zerionCli";

/**
 * Returns treasury context for a wallet address using Zerion API or Zerion CLI.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const treasuryWallet = url.searchParams.get("wallet");

  if (!treasuryWallet) {
    return NextResponse.json({ message: "wallet query parameter is required" }, { status: 400 });
  }

  return NextResponse.json(await getTreasuryContext(treasuryWallet));
}
