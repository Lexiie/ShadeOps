import { Connection, PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { executeCloakPayout } from "@/lib/privacy/cloakClient";
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

  it("rejects non-SOL payouts until token execution is wired", async () => {
    await expect(
      executeCloakPayout({
        ...baseRequest,
        plan: {
          ...baseRequest.plan,
          parsedOperation: {
            ...baseRequest.plan.parsedOperation,
            tokenSymbol: "USDC",
            tokenMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
          }
        }
      })
    ).rejects.toThrow(/native SOL execution/i);
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
