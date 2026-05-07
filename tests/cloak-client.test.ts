import { Connection, PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { executeCloakPayout, resolveCloakToken } from "@/lib/privacy/cloakClient";
import type { PrivacyExecutionRequest } from "@/lib/privacy/types";

const validRecipient = "11111111111111111111111111111111";
const validSigner = "So11111111111111111111111111111111111111112";

const baseRequest: PrivacyExecutionRequest = {
  connection: new Connection("https://api.devnet.solana.com"),
  wallet: {
    publicKey: new PublicKey(validSigner),
    signMessage: async (message) => message,
    signTransaction: async (transaction) => transaction
  },
  plan: {
    operationId: "cloak-test-plan",
    parsedOperation: {
      recipientLabel: "Vendor",
      recipientWallet: validRecipient,
      tokenSymbol: "SOL",
      amount: "0.1",
      reason: "Vendor payout",
      privacyRequested: true
    },
    policyResult: {
      status: "pass",
      ruleResults: [{ ruleId: "test", status: "pass", message: "ok" }]
    },
    routeDecision: {
      mode: "cloak",
      reasonCode: "AUDIT_FRIENDLY_PRIVATE_PAYOUT",
      explanation: "vendor payout",
      tradeoffs: []
    },
    requiresAdminSignature: true,
    steps: [],
    transactionPreparationStatus: "ready_for_signature"
  }
};

describe("executeCloakPayout", () => {
  it("requires a wallet that can sign transactions and messages", async () => {
    await expect(executeCloakPayout({ ...baseRequest, wallet: { publicKey: new PublicKey(validSigner) } })).rejects.toThrow(
      /sign and send transactions/i
    );
  });

  it("rejects tokens outside the Cloak adapter allowlist", async () => {
    await expect(
      executeCloakPayout({
        ...baseRequest,
        plan: {
          ...baseRequest.plan,
          parsedOperation: {
            ...baseRequest.plan.parsedOperation,
            tokenSymbol: "BONK",
            tokenMint: "DezXAZ8z7PnrnRJjz3XtVJfgL3eeZ6t19sxrHHjZ5Y6"
          }
        }
      })
    ).rejects.toThrow(/SOL, USDC, and USDT/i);
  });

  it("resolves USDC and USDT mint metadata for Cloak SPL execution", () => {
    const nativeMint = new PublicKey("So11111111111111111111111111111111111111112");

    expect(resolveCloakToken("USDC", undefined, nativeMint)).toMatchObject({
      symbol: "USDC",
      decimals: 6
    });
    expect(resolveCloakToken("USDC", undefined, nativeMint).mint.toBase58()).toBe("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
    expect(resolveCloakToken("USDT", undefined, nativeMint).mint.toBase58()).toBe("Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB");
  });

  it("requires a resolved recipient wallet", async () => {
    await expect(
      executeCloakPayout({
        ...baseRequest,
        plan: {
          ...baseRequest.plan,
          parsedOperation: { ...baseRequest.plan.parsedOperation, recipientWallet: undefined }
        }
      })
    ).rejects.toThrow(/recipient wallet is required/i);
  });
});
