export const DEVNET_RPC_ENDPOINT = "https://api.devnet.solana.com";

/**
 * Keeps ShadeOps on devnet even when a deployment has stale mainnet RPC env vars.
 */
export function resolveDevnetRpcEndpoint(value: string | undefined): string {
  const endpoint = value?.trim();

  if (endpoint?.toLowerCase().includes("devnet")) {
    return endpoint;
  }

  return DEVNET_RPC_ENDPOINT;
}
