import { hasSupabaseApiConfig } from "@/lib/db/supabase";

type PrismaLike = {
  contact?: unknown;
  treasuryConfig?: unknown;
  workspace?: unknown;
  workspaceMember?: unknown;
  payoutOperation?: unknown;
  proofRecord?: unknown;
};

type GlobalWithPrisma = typeof globalThis & {
  shadeopsPrisma?: PrismaLike | null;
};

const PRODUCTION_DATABASE_ERROR = "DATABASE_URL and a generated Prisma client are required in production.";

/**
 * Returns a Prisma client when DATABASE_URL and a generated client are available.
 * Falls back to null in local demo environments where Prisma generation is not installed.
 */
export async function getPrismaClient(): Promise<PrismaLike | null> {
  if (!process.env.DATABASE_URL) {
    if (requiresProductionPersistence()) {
      throw new Error(PRODUCTION_DATABASE_ERROR);
    }

    return null;
  }

  const globalForPrisma = globalThis as GlobalWithPrisma;

  if (globalForPrisma.shadeopsPrisma !== undefined) {
    return globalForPrisma.shadeopsPrisma;
  }

  try {
    const prismaModule = (await import("@prisma/client")) as { PrismaClient?: new () => PrismaLike };
    globalForPrisma.shadeopsPrisma = prismaModule.PrismaClient ? new prismaModule.PrismaClient() : null;
  } catch {
    if (requiresProductionPersistence()) {
      throw new Error(PRODUCTION_DATABASE_ERROR);
    }

    globalForPrisma.shadeopsPrisma = null;
  }

  if (!globalForPrisma.shadeopsPrisma && requiresProductionPersistence()) {
    throw new Error(PRODUCTION_DATABASE_ERROR);
  }

  return globalForPrisma.shadeopsPrisma;
}

export function requiresProductionPersistence(): boolean {
  return process.env.NODE_ENV === "production" && !hasSupabaseApiConfig();
}
