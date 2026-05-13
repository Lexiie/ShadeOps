export const KNOWN_TOKEN_MINTS = {
  USDC: "61ro7AExqfk4dZYoCyRzTahahCC2TdUUZ4M5epMPunJf",
  USDT: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"
} as const;

export const KNOWN_TOKEN_DECIMALS = {
  SOL: 9,
  USDC: 6,
  USDT: 6
} as const;

export type KnownTokenSymbol = keyof typeof KNOWN_TOKEN_DECIMALS;

export function normalizeTokenSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

export function isKnownTokenSymbol(symbol: string): symbol is KnownTokenSymbol {
  return normalizeTokenSymbol(symbol) in KNOWN_TOKEN_DECIMALS;
}

export function defaultMintForToken(symbol: string): string | undefined {
  const tokenSymbol = normalizeTokenSymbol(symbol);

  if (tokenSymbol === "USDC" || tokenSymbol === "USDT") {
    return KNOWN_TOKEN_MINTS[tokenSymbol];
  }

  return undefined;
}

export function decimalsForToken(symbol: string): number {
  const tokenSymbol = normalizeTokenSymbol(symbol);

  if (isKnownTokenSymbol(tokenSymbol)) {
    return KNOWN_TOKEN_DECIMALS[tokenSymbol];
  }

  return 9;
}
