import { afterEach, describe, expect, it, vi } from "vitest";
import { getPrismaClient, requiresProductionPersistence } from "@/lib/db/prisma";

describe("Prisma production guard", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows runtime stores outside production", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DATABASE_URL", "");

    await expect(getPrismaClient()).resolves.toBeNull();
  });

  it("requires persistent storage in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");

    expect(requiresProductionPersistence()).toBe(true);
    await expect(getPrismaClient()).rejects.toThrow(/generated Prisma client/i);
  });

  it("treats Supabase API credentials as production persistence", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("SUPABASE_URL", "https://shadeops.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");

    expect(requiresProductionPersistence()).toBe(false);
    await expect(getPrismaClient()).resolves.toBeNull();
  });
});
