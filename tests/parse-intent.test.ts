import { describe, expect, it } from "vitest";
import { parsePayoutIntentDeterministically } from "@/lib/agent/parseIntent";

describe("parsePayoutIntentDeterministically", () => {
  it("resolves USDT to the Solana USDT mint", () => {
    const operation = parsePayoutIntentDeterministically({
      rawText: "Pay vendor 25 USDT privately for invoice 42",
      treasuryWallet: "ShadeTreasury1111111111111111111111111111111"
    });

    expect(operation.tokenSymbol).toBe("USDT");
    expect(operation.tokenMint).toBe("Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB");
  });
});
