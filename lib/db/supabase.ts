type JsonRecord = Record<string, unknown>;

export const SUPABASE_TABLES = {
  workspace: "Workspace",
  workspaceMember: "WorkspaceMember",
  contact: "Contact",
  treasuryConfig: "TreasuryConfig",
  payoutOperation: "PayoutOperation",
  proofRecord: "ProofRecord"
} as const;

type SupabaseRestClient = {
  selectMany: (table: string, query?: Record<string, string>) => Promise<unknown[]>;
  selectOne: (table: string, query?: Record<string, string>) => Promise<unknown | null>;
  insert: (table: string, data: JsonRecord) => Promise<unknown>;
  upsert: (table: string, data: JsonRecord, onConflict: string) => Promise<unknown>;
};

export function hasSupabaseApiConfig(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Returns a tiny server-side Supabase REST client when API credentials are configured.
 */
export function getSupabaseRestClient(): SupabaseRestClient | null {
  const baseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!baseUrl || !serviceRoleKey) {
    return null;
  }

  const restBaseUrl = baseUrl;
  const restServiceRoleKey = serviceRoleKey as string;

  async function request(table: string, init: RequestInit = {}, query: Record<string, string> = {}): Promise<unknown> {
    const url = new URL(`${restBaseUrl}/rest/v1/${encodeURIComponent(table)}`);

    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }

    const response = await fetch(url, {
      ...init,
      headers: {
        apikey: restServiceRoleKey,
        Authorization: `Bearer ${restServiceRoleKey}`,
        "Content-Type": "application/json",
        ...init.headers
      }
    });

    if (!response.ok) {
      const message = await response.text().catch(() => "");
      throw new Error(`Supabase API request failed for ${table}: ${response.status}${message ? ` ${message}` : ""}`);
    }

    if (response.status === 204) {
      return null;
    }

    return response.json();
  }

  return {
    async selectMany(table, query = {}) {
      const result = await request(table, { method: "GET" }, { select: "*", ...query });
      return Array.isArray(result) ? result : [];
    },
    async selectOne(table, query = {}) {
      const result = await request(table, { method: "GET" }, { select: "*", ...query, limit: "1" });
      return Array.isArray(result) ? result[0] ?? null : result ?? null;
    },
    async insert(table, data) {
      const result = await request(table, { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(data) });
      return Array.isArray(result) ? result[0] : result;
    },
    async upsert(table, data, onConflict) {
      const result = await request(
        table,
        {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=representation" },
          body: JSON.stringify(data)
        },
        { on_conflict: onConflict }
      );
      return Array.isArray(result) ? result[0] : result;
    }
  };
}
