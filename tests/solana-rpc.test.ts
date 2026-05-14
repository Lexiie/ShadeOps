import { describe, expect, it } from "vitest";
import { DEVNET_RPC_ENDPOINT, resolveDevnetRpcEndpoint } from "@/lib/solanaRpc";

describe("resolveDevnetRpcEndpoint", () => {
  it("falls back to Solana devnet when no RPC endpoint is configured", () => {
    expect(resolveDevnetRpcEndpoint(undefined)).toBe(DEVNET_RPC_ENDPOINT);
  });

  it("ignores stale mainnet RPC endpoints", () => {
    expect(resolveDevnetRpcEndpoint("https://api.mainnet-beta.solana.com")).toBe(DEVNET_RPC_ENDPOINT);
  });

  it("allows explicit devnet RPC endpoints", () => {
    expect(resolveDevnetRpcEndpoint("https://devnet.helius-rpc.com/?api-key=test")).toBe("https://devnet.helius-rpc.com/?api-key=test");
  });
});
