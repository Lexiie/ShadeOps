import { Connection, PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { executeCloakPayout, resolveCloakCircuitsUrl, resolveCloakRelayUrl, resolveCloakToken, validateCloakCircuitWasm } from "@/lib/privacy/cloakClient";
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

  it("accepts a Cloak circuit artifact with the WebAssembly magic header", async () => {
    const fetchWasm = async () => new Response(new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]));

    await expect(validateCloakCircuitWasm("https://circuits.example", fetchWasm as typeof fetch)).resolves.toBeUndefined();
  });

  it("reports a clear Cloak circuit configuration error when the artifact URL returns XML", async () => {
    const fetchXml = async () =>
      new Response("<?xml version=\"1.0\"?><Error><Code>AccessDenied</Code></Error>", {
        status: 403,
        statusText: "Forbidden",
        headers: { "content-type": "application/xml" }
      });

    await expect(validateCloakCircuitWasm("https://circuits.example", fetchXml as typeof fetch)).rejects.toThrow(
      /NEXT_PUBLIC_CLOAK_CIRCUITS_URL/i
    );
  });

  it("resolves Cloak public env settings through static Next references", () => {
    const originalCircuitsUrl = process.env.NEXT_PUBLIC_CLOAK_CIRCUITS_URL;
    const originalRelayUrl = process.env.NEXT_PUBLIC_CLOAK_RELAY_URL;

    process.env.NEXT_PUBLIC_CLOAK_CIRCUITS_URL = "https://circuits.example/custom/";
    process.env.NEXT_PUBLIC_CLOAK_RELAY_URL = "https://relay.example/";

    try {
      expect(resolveCloakCircuitsUrl()).toBe("https://circuits.example/custom");
      expect(resolveCloakRelayUrl()).toBe("https://relay.example");
    } finally {
      process.env.NEXT_PUBLIC_CLOAK_CIRCUITS_URL = originalCircuitsUrl;
      process.env.NEXT_PUBLIC_CLOAK_RELAY_URL = originalRelayUrl;
    }
  });
});
