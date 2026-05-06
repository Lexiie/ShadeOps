/**
 * Converts a decimal token amount string into integer base units without floating point math.
 */
export function decimalToBaseUnits(amount: string, decimals: number): bigint {
  const [wholePart, fractionPart = ""] = amount.split(".");
  const extraPrecision = fractionPart.slice(decimals);

  if (extraPrecision && /[1-9]/.test(extraPrecision)) {
    throw new Error(`Amount ${amount} has more precision than the token supports.`);
  }

  const paddedFraction = fractionPart.padEnd(decimals, "0").slice(0, decimals);

  return BigInt(wholePart || "0") * BigInt(10) ** BigInt(decimals) + BigInt(paddedFraction || "0");
}

/**
 * Converts a SOL amount string into lamports without floating point math.
 */
export function solToLamports(amount: string): bigint {
  return decimalToBaseUnits(amount, 9);
}
