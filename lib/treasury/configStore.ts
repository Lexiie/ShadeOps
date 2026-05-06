import { getPrismaClient } from "@/lib/db/prisma";
import { getSupabaseRestClient, SUPABASE_TABLES } from "@/lib/db/supabase";
import { treasuryConfigInputSchema, treasuryConfigSchema, type TreasuryConfig, type TreasuryConfigInput } from "@/lib/schemas/treasury";

const DEFAULT_WORKSPACE_ID = "default";

type TreasuryConfigDelegate = {
  findUnique: (args: { where: { workspaceId: string } }) => Promise<unknown | null>;
  upsert: (args: {
    where: { workspaceId: string };
    update: Record<string, unknown>;
    create: Record<string, unknown>;
  }) => Promise<unknown>;
};

let treasuryConfig: TreasuryConfig | null = null;

/**
 * Returns the configured treasury for the current app process.
 */
export function getTreasuryConfig(): TreasuryConfig | null {
  return treasuryConfig ? treasuryConfigSchema.parse(treasuryConfig) : null;
}

/**
 * Returns treasury config from Prisma when configured, otherwise from the runtime demo store.
 */
export async function getTreasuryConfigForWorkspace(workspaceId = DEFAULT_WORKSPACE_ID): Promise<TreasuryConfig | null> {
  const supabase = getSupabaseRestClient();

  if (supabase) {
    const row = await supabase.selectOne(SUPABASE_TABLES.treasuryConfig, { workspaceId: `eq.${workspaceId}` });
    return row ? parseDbTreasuryConfig(row) : null;
  }

  const delegate = await getTreasuryConfigDelegate();

  if (!delegate) {
    return getTreasuryConfig();
  }

  const row = await delegate.findUnique({ where: { workspaceId } });

  return row ? parseDbTreasuryConfig(row) : null;
}

/**
 * Saves the treasury selected for payout planning.
 */
export function saveTreasuryConfig(input: TreasuryConfigInput): TreasuryConfig {
  const parsed = treasuryConfigInputSchema.parse(input);
  treasuryConfig = treasuryConfigSchema.parse({
    ...parsed,
    label: parsed.label.trim(),
    updatedAt: new Date().toISOString()
  });

  return treasuryConfig;
}

/**
 * Saves treasury config in Prisma when configured, otherwise in the runtime demo store.
 */
export async function saveTreasuryConfigForWorkspace(input: TreasuryConfigInput, workspaceId = DEFAULT_WORKSPACE_ID): Promise<TreasuryConfig> {
  const parsed = treasuryConfigInputSchema.parse(input);
  const data = {
    workspaceId,
    label: parsed.label.trim(),
    walletAddress: parsed.walletAddress,
    network: parsed.network,
    source: parsed.source
  };
  const supabase = getSupabaseRestClient();

  if (supabase) {
    return parseDbTreasuryConfig(await supabase.upsert(SUPABASE_TABLES.treasuryConfig, data, "workspaceId"));
  }

  const delegate = await getTreasuryConfigDelegate();

  if (!delegate) {
    return saveTreasuryConfig(parsed);
  }

  const row = await delegate.upsert({
    where: { workspaceId },
    update: data,
    create: data
  });

  return parseDbTreasuryConfig(row);
}

async function getTreasuryConfigDelegate(): Promise<TreasuryConfigDelegate | null> {
  const prisma = await getPrismaClient();
  const delegate = prisma?.treasuryConfig;

  return isTreasuryConfigDelegate(delegate) ? delegate : null;
}

function isTreasuryConfigDelegate(value: unknown): value is TreasuryConfigDelegate {
  return Boolean(value && typeof value === "object" && "findUnique" in value && "upsert" in value);
}

function parseDbTreasuryConfig(value: unknown): TreasuryConfig {
  const row = value as { label?: string; walletAddress?: string; network?: string; source?: string; updatedAt?: Date | string };

  return treasuryConfigSchema.parse({
    label: row.label,
    walletAddress: row.walletAddress,
    network: row.network,
    source: row.source,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt
  });
}
