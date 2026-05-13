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

  it("rejects tokens outside the Cloak devnet adapter allowlist", async () => {
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
    ).rejects.toThrow(/SOL and devnet mock USDC/i);
  });

  it("resolves USDC to the Cloak devnet mock mint", () => {
    const nativeMint = new PublicKey("So11111111111111111111111111111111111111112");
    const devnetMockUsdcMint = new PublicKey("61ro7AExqfk4dZYoCyRzTahahCC2TdUUZ4M5epMPunJf");

    expect(resolveCloakToken("USDC", undefined, nativeMint, devnetMockUsdcMint)).toMatchObject({
      symbol: "USDC",
      decimals: 6
    });
    expect(resolveCloakToken("USDC", undefined, nativeMint, devnetMockUsdcMint).mint.toBase58()).toBe("61ro7AExqfk4dZYoCyRzTahahCC2TdUUZ4M5epMPunJf");
  });

  it("rejects USDT on Cloak devnet", () => {
    const nativeMint = new PublicKey("So11111111111111111111111111111111111111112");
    const devnetMockUsdcMint = new PublicKey("61ro7AExqfk4dZYoCyRzTahahCC2TdUUZ4M5epMPunJf");

    expect(() => resolveCloakToken("USDT", undefined, nativeMint, devnetMockUsdcMint)).toThrow(/mainnet Cloak for USDT/i);
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
