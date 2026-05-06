import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { type TreasuryContext, treasuryContextSchema } from "@/lib/schemas/payout";

const execFileAsync = promisify(execFile);
const ZERION_API_BASE_URL = "https://api.zerion.io/v1";
const TOP_POSITION_LIMIT = 5;
const RECENT_TRANSACTION_LIMIT = 10;

type JsonRecord = Record<string, unknown>;
type ZerionFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

/**
 * Reads treasury context from Zerion API or CLI and fails closed when neither path works.
 */
export async function getTreasuryContext(treasuryWallet: string): Promise<TreasuryContext> {
  if (process.env.ZERION_API_KEY) {
    return getZerionApiTreasuryContext(treasuryWallet, process.env.ZERION_API_KEY);
  }

  const command = process.env.ZERION_CLI_PATH ?? "zerion";
  const args = resolveZerionCliArgs(process.env.ZERION_CLI_ARGS, treasuryWallet);
  const { stdout } = await execFileAsync(command, args, { timeout: 15000 });

  return parseZerionCliOutput(treasuryWallet, stdout);
}

/**
 * Resolves the local Zerion CLI command shape. The default follows the app docs;
 * env args may use {wallet} as a placeholder for alternate CLI versions.
 */
export function resolveZerionCliArgs(argsTemplate: string | undefined, treasuryWallet: string): string[] {
  const args = argsTemplate?.trim() ? argsTemplate.trim().split(/\s+/) : ["wallet", treasuryWallet, "--json"];

  return args.map((arg) => (arg === "{wallet}" ? treasuryWallet : arg));
}

/**
 * Normalizes common Zerion CLI JSON shapes into the treasury context contract.
 */
export function parseZerionCliOutput(treasuryWallet: string, stdout: string): TreasuryContext {
  const parsed = asRecord(JSON.parse(stdout));
  const rawHoldings = asArray(parsed.holdings ?? parsed.positions ?? parsed.assets);
  const holdings = normalizeHoldings(rawHoldings);
  const topPositions = buildTopPositions(holdings);
  const recentTransactions = normalizeTransactions(asArray(parsed.recentTransactions ?? parsed.transactions ?? parsed.activity), treasuryWallet);
  const portfolioValueUsd = toFiniteNumber(parsed.portfolioValueUsd ?? parsed.totalValueUsd ?? readNestedNumber(parsed, ["portfolio", "valueUsd"]));
  const recentOutflowUsd = toFiniteNumber(parsed.recentOutflowUsd) ?? sumRecentOutflowUsd(recentTransactions);

  return treasuryContextSchema.parse({
    treasuryWallet,
    source: "zerion-cli",
    summary: buildTreasurySummary("Zerion CLI", holdings.length, portfolioValueUsd, recentOutflowUsd),
    portfolioValueUsd,
    portfolioChangeUsd1d: toFiniteNumber(parsed.portfolioChangeUsd1d ?? readNestedNumber(parsed, ["portfolio", "changes", "absolute_1d"])),
    portfolioChangePercent1d: toFiniteNumber(parsed.portfolioChangePercent1d ?? readNestedNumber(parsed, ["portfolio", "changes", "percent_1d"])),
    holdings,
    topPositions,
    recentTransactions,
    recentOutflowUsd,
    observedAt: new Date().toISOString()
  });
}

/**
 * Reads Zerion wallet portfolio, simple positions, and recent transactions.
 */
export async function getZerionApiTreasuryContext(treasuryWallet: string, apiKey: string, fetcher: ZerionFetch = fetch): Promise<TreasuryContext> {
  const [portfolio, positions, transactions] = await Promise.all([
    fetchZerionJson(buildZerionWalletUrl(treasuryWallet, "portfolio"), apiKey, fetcher),
    fetchZerionJson(buildZerionWalletUrl(treasuryWallet, "positions"), apiKey, fetcher),
    fetchZerionJson(buildZerionWalletUrl(treasuryWallet, "transactions"), apiKey, fetcher)
  ]);

  return parseZerionApiTreasuryContext(treasuryWallet, { portfolio, positions, transactions });
}

/**
 * Builds the Zerion API request URLs used by the treasury observer.
 */
export function buildZerionWalletUrl(treasuryWallet: string, resource: "portfolio" | "positions" | "transactions"): URL {
  const url = new URL(`${ZERION_API_BASE_URL}/wallets/${treasuryWallet}/${resource}/`);
  url.searchParams.set("currency", "usd");

  if (resource === "positions") {
    url.searchParams.set("filter[positions]", "only_simple");
    url.searchParams.set("filter[position_types]", "wallet");
    url.searchParams.set("sort", "-value");
    url.searchParams.set("page[size]", String(TOP_POSITION_LIMIT));
    url.searchParams.set("sync", "true");
  }

  if (resource === "portfolio") {
    url.searchParams.set("filter[positions]", "only_simple");
    url.searchParams.set("sync", "true");
  }

  if (resource === "transactions") {
    url.searchParams.set("page[size]", String(RECENT_TRANSACTION_LIMIT));
  }

  return url;
}

/**
 * Backward-compatible helper for tests and callers that only have positions data.
 */
export function parseZerionApiPositions(treasuryWallet: string, payload: unknown): TreasuryContext {
  return parseZerionApiTreasuryContext(treasuryWallet, { positions: payload });
}

/**
 * Converts Zerion API resources into ShadeOps treasury context.
 */
export function parseZerionApiTreasuryContext(
  treasuryWallet: string,
  payload: Readonly<{ portfolio?: unknown; positions?: unknown; transactions?: unknown }>
): TreasuryContext {
  const portfolioAttributes = asRecord(asRecord(payload.portfolio).data)?.attributes;
  const portfolio = asRecord(portfolioAttributes);
  const positions = asArray(asRecord(payload.positions).data);
  const transactions = asArray(asRecord(payload.transactions).data);
  const holdings = normalizeHoldings(positions);
  const topPositions = buildTopPositions(holdings);
  const recentTransactions = normalizeTransactions(transactions, treasuryWallet);
  const portfolioValueUsd = firstFiniteNumber([portfolio.total, readNestedNumber(portfolio, ["total", "positions"]), portfolio.value, portfolio.valueUsd]);
  const recentOutflowUsd = sumRecentOutflowUsd(recentTransactions);

  return treasuryContextSchema.parse({
    treasuryWallet,
    source: "zerion-api",
    summary: buildTreasurySummary("Zerion API", holdings.length, portfolioValueUsd, recentOutflowUsd),
    portfolioValueUsd,
    portfolioChangeUsd1d: readNestedNumber(portfolio, ["changes", "absolute_1d"]),
    portfolioChangePercent1d: toFiniteNumber(readNestedNumber(portfolio, ["changes", "percent_1d"])),
    holdings,
    topPositions,
    recentTransactions,
    recentOutflowUsd,
    observedAt: new Date().toISOString()
  });
}

async function fetchZerionJson(url: URL, apiKey: string, fetcher: ZerionFetch): Promise<unknown> {
  const response = await fetcher(url, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Zerion API request failed with ${response.status} for ${url.pathname}.`);
  }

  return response.json();
}

function normalizeHoldings(rawHoldings: unknown[]): TreasuryContext["holdings"] {
  return rawHoldings.map((rawHolding) => {
    const holding = asRecord(rawHolding);
    const attributes = asRecord(holding.attributes);
    const quantity = asRecord(attributes.quantity ?? holding.quantity);
    const fungibleInfo = asRecord(attributes.fungible_info ?? holding.fungible_info ?? holding.token ?? holding.asset);
    const relationships = asRecord(holding.relationships);
    const chainData = asRecord(asRecord(relationships.chain).data);
    const symbol = toStringValue(holding.symbol ?? attributes.symbol ?? fungibleInfo.symbol) ?? "UNKNOWN";
    const balance = toStringValue(holding.balance ?? holding.spendable ?? quantity.numeric ?? quantity.float) ?? "0";
    const valueUsd = toFiniteNumber(holding.valueUsd ?? holding.value_usd ?? attributes.value ?? readNestedNumber(attributes, ["price", "value"]));

    return {
      symbol,
      balance,
      spendable: toStringValue(holding.spendable ?? balance) ?? balance,
      valueUsd,
      chain: toStringValue(holding.chain ?? attributes.chain ?? chainData.id),
      positionType: toStringValue(holding.positionType ?? holding.position_type ?? attributes.position_type)
    };
  });
}

function buildTopPositions(holdings: TreasuryContext["holdings"]): TreasuryContext["topPositions"] {
  return [...holdings]
    .sort((first, second) => (second.valueUsd ?? 0) - (first.valueUsd ?? 0))
    .slice(0, TOP_POSITION_LIMIT)
    .map((holding) => ({ symbol: holding.symbol, balance: holding.balance, valueUsd: holding.valueUsd, chain: holding.chain }));
}

function normalizeTransactions(rawTransactions: unknown[], treasuryWallet: string): TreasuryContext["recentTransactions"] {
  return rawTransactions.map((rawTransaction) => {
    const transaction = asRecord(rawTransaction);
    const attributes = asRecord(transaction.attributes ?? transaction);
    const transfers = asArray(attributes.transfers ?? transaction.transfers).map(asRecord);
    const direction = normalizeDirection(attributes.direction ?? inferDirection(attributes, transfers, treasuryWallet));
    const valueUsd = toFiniteNumber(attributes.value ?? attributes.valueUsd ?? attributes.value_usd ?? sumTransferUsd(transfers, direction));

    return {
      hash: toStringValue(attributes.hash ?? transaction.id ?? attributes.tx_hash) ?? "unknown",
      direction,
      valueUsd,
      description: toStringValue(attributes.description ?? attributes.operation_type ?? attributes.type),
      minedAt: toStringValue(attributes.mined_at ?? attributes.minedAt ?? attributes.date)
    };
  });
}

function inferDirection(attributes: JsonRecord, transfers: JsonRecord[], treasuryWallet: string): TreasuryContext["recentTransactions"][number]["direction"] {
  const treasuryAddress = normalizeAddress(treasuryWallet);
  const sentFrom = normalizeAddress(toStringValue(attributes.sent_from ?? attributes.from));
  const sentTo = normalizeAddress(toStringValue(attributes.sent_to ?? attributes.to));

  if (sentFrom && sentFrom === treasuryAddress && sentTo && sentTo !== treasuryAddress) {
    return "out";
  }

  if (sentTo && sentTo === treasuryAddress && sentFrom && sentFrom !== treasuryAddress) {
    return "in";
  }

  const directions = transfers.map((transfer) => normalizeDirection(transfer.direction ?? transfer.type));

  if (directions.includes("out")) {
    return "out";
  }

  if (directions.includes("in")) {
    return "in";
  }

  return directions.includes("self") ? "self" : "unknown";
}

function normalizeAddress(value: string | undefined): string | undefined {
  return value?.toLowerCase();
}

function normalizeDirection(value: unknown): TreasuryContext["recentTransactions"][number]["direction"] {
  const normalized = toStringValue(value)?.toLowerCase();

  if (["out", "send", "sent", "withdrawal", "debit"].includes(normalized ?? "")) {
    return "out";
  }

  if (["in", "receive", "received", "deposit", "credit"].includes(normalized ?? "")) {
    return "in";
  }

  return normalized === "self" ? "self" : "unknown";
}

function sumTransferUsd(transfers: JsonRecord[], direction: TreasuryContext["recentTransactions"][number]["direction"]): number | undefined {
  const matchingTransfers = transfers.filter((transfer) => direction === "unknown" || normalizeDirection(transfer.direction ?? transfer.type) === direction);
  const total = matchingTransfers.reduce((sum, transfer) => sum + (toFiniteNumber(transfer.value ?? transfer.value_usd ?? readNestedNumber(transfer, ["price", "value"])) ?? 0), 0);

  return total > 0 ? total : undefined;
}

function sumRecentOutflowUsd(transactions: TreasuryContext["recentTransactions"]): number {
  return transactions.reduce((sum, transaction) => (transaction.direction === "out" ? sum + (transaction.valueUsd ?? 0) : sum), 0);
}

function buildTreasurySummary(source: string, holdingCount: number, portfolioValueUsd: number | undefined, recentOutflowUsd: number): string {
  const portfolio = typeof portfolioValueUsd === "number" ? ` Portfolio value is ${formatUsd(portfolioValueUsd)}.` : "";
  const outflow = recentOutflowUsd > 0 ? ` Recent outflow is ${formatUsd(recentOutflowUsd)}.` : " Recent outflow is within observed normal range.";

  return `${source} returned ${holdingCount} wallet position${holdingCount === 1 ? "" : "s"} for review.${portfolio}${outflow}`;
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", { currency: "USD", maximumFractionDigits: 2, style: "currency" }).format(value);
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function toStringValue(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return undefined;
}

function toFiniteNumber(value: unknown): number | undefined {
  const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;

  return Number.isFinite(numeric) ? numeric : undefined;
}

function firstFiniteNumber(values: unknown[]): number | undefined {
  for (const value of values) {
    const numeric = toFiniteNumber(value);

    if (typeof numeric === "number") {
      return numeric;
    }
  }

  return undefined;
}

function readNestedNumber(record: JsonRecord, path: string[]): number | undefined {
  let current: unknown = record;

  for (const key of path) {
    current = asRecord(current)[key];
  }

  return toFiniteNumber(current);
}
