import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getPrismaClient } from "@/lib/db/prisma";
import { getSupabaseRestClient, SUPABASE_TABLES } from "@/lib/db/supabase";

export const DEFAULT_WORKSPACE_ID = "default";

export const workspaceRoleSchema = z.enum(["owner", "admin", "reviewer"]);

export type WorkspaceRole = z.infer<typeof workspaceRoleSchema>;

export type Workspace = {
  id: string;
  slug: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceMembership = {
  workspaceId: string;
  walletAddress: string;
  role: WorkspaceRole;
  workspace: Workspace;
};

type WorkspaceDelegate = {
  findFirst: (args: { where: { members: { some: { walletAddress: string } } }; orderBy: { createdAt: "asc" } }) => Promise<unknown>;
  create: (args: { data: { slug: string; name: string; members: { create: { walletAddress: string; role: WorkspaceRole } } }; include: { members: true } }) => Promise<unknown>;
};

type WorkspaceMemberDelegate = {
  findFirst: (args: { where: { workspaceId: string; walletAddress: string }; include: { workspace: true } }) => Promise<unknown>;
};

const WORKSPACES: Workspace[] = [];
const MEMBERSHIPS: Array<{ workspaceId: string; walletAddress: string; role: WorkspaceRole }> = [];

/**
 * Returns the first workspace available to a wallet, if one exists.
 */
export async function getPrimaryWorkspaceForWallet(walletAddress: string): Promise<WorkspaceMembership | null> {
  const supabase = getSupabaseRestClient();

  if (supabase) {
    const memberships = await supabase.selectMany(SUPABASE_TABLES.workspaceMember, { walletAddress: `eq.${walletAddress}`, order: "createdAt.asc", limit: "1" });
    const membership = memberships[0] as { workspaceId?: string; role?: string } | undefined;

    if (!membership?.workspaceId) {
      return null;
    }

    const workspace = await supabase.selectOne(SUPABASE_TABLES.workspace, { id: `eq.${membership.workspaceId}` });
    return workspace ? parseSupabaseWorkspaceMembership(membership.workspaceId, walletAddress, membership.role, workspace) : null;
  }

  const delegate = await getWorkspaceDelegate();

  if (!delegate) {
    return getRuntimePrimaryWorkspace(walletAddress);
  }

  const row = await delegate.findFirst({ where: { members: { some: { walletAddress } } }, orderBy: { createdAt: "asc" } });
  return row ? parseWorkspaceWithMember(row, walletAddress) : null;
}

/**
 * Creates a workspace and assigns the signing wallet as owner.
 */
export async function createWorkspaceForWallet(input: { name: string; walletAddress: string }): Promise<WorkspaceMembership> {
  const name = input.name.trim();
  const walletAddress = input.walletAddress.trim();
  const slug = slugifyWorkspace(name);
  const supabase = getSupabaseRestClient();

  if (supabase) {
    const workspace = await supabase.insert(SUPABASE_TABLES.workspace, {
      id: randomUUID(),
      slug: `${slug}-${randomUUID().slice(0, 8)}`,
      name
    });
    const parsedWorkspace = parseWorkspace(workspace);
    await supabase.insert(SUPABASE_TABLES.workspaceMember, {
      id: randomUUID(),
      workspaceId: parsedWorkspace.id,
      walletAddress,
      role: "owner"
    });
    return { workspaceId: parsedWorkspace.id, walletAddress, role: "owner", workspace: parsedWorkspace };
  }

  const delegate = await getWorkspaceDelegate();

  if (!delegate) {
    const workspace = createRuntimeWorkspace(name, slug);
    MEMBERSHIPS.push({ workspaceId: workspace.id, walletAddress, role: "owner" });
    return { workspaceId: workspace.id, walletAddress, role: "owner", workspace };
  }

  const row = await delegate.create({
    data: {
      slug: `${slug}-${randomUUID().slice(0, 8)}`,
      name,
      members: { create: { walletAddress, role: "owner" } }
    },
    include: { members: true }
  });

  return parseWorkspaceWithMember(row, walletAddress);
}

/**
 * Resolves a wallet role from persisted workspace membership.
 */
export async function getWorkspaceMembership(walletAddress: string, workspaceId: string): Promise<WorkspaceMembership | null> {
  const supabase = getSupabaseRestClient();

  if (supabase) {
    const membership = await supabase.selectOne(SUPABASE_TABLES.workspaceMember, { workspaceId: `eq.${workspaceId}`, walletAddress: `eq.${walletAddress}` });

    if (!membership) {
      return null;
    }

    const workspace = await supabase.selectOne(SUPABASE_TABLES.workspace, { id: `eq.${workspaceId}` });
    return workspace ? parseSupabaseWorkspaceMembership(workspaceId, walletAddress, (membership as { role?: string }).role, workspace) : null;
  }

  const delegate = await getWorkspaceMemberDelegate();

  if (!delegate) {
    return getRuntimeWorkspaceMembership(walletAddress, workspaceId);
  }

  const row = await delegate.findFirst({ where: { workspaceId, walletAddress }, include: { workspace: true } });
  return row ? parseWorkspaceMembership(row) : null;
}

/**
 * Seeds the runtime store from SHADEOPS_WORKSPACE_MEMBERS for bootstrap/admin fallback.
 */
export function ensureRuntimeBootstrapMembers(members: Array<{ workspaceId: string; walletAddress: string; role: WorkspaceRole }>): void {
  for (const member of members) {
    const workspace = ensureRuntimeWorkspace(member.workspaceId);
    const exists = MEMBERSHIPS.some((item) => item.workspaceId === workspace.id && item.walletAddress === member.walletAddress);

    if (!exists) {
      MEMBERSHIPS.push({ ...member, workspaceId: workspace.id });
    }
  }
}

async function getWorkspaceDelegate(): Promise<WorkspaceDelegate | null> {
  const prisma = await getPrismaClient();
  const delegate = prisma?.workspace;
  return isWorkspaceDelegate(delegate) ? delegate : null;
}

async function getWorkspaceMemberDelegate(): Promise<WorkspaceMemberDelegate | null> {
  const prisma = await getPrismaClient();
  const delegate = prisma?.workspaceMember;
  return isWorkspaceMemberDelegate(delegate) ? delegate : null;
}

function isWorkspaceDelegate(value: unknown): value is WorkspaceDelegate {
  return Boolean(value && typeof value === "object" && "findFirst" in value && "create" in value);
}

function isWorkspaceMemberDelegate(value: unknown): value is WorkspaceMemberDelegate {
  return Boolean(value && typeof value === "object" && "findFirst" in value);
}

function getRuntimePrimaryWorkspace(walletAddress: string): WorkspaceMembership | null {
  const membership = MEMBERSHIPS.find((item) => item.walletAddress === walletAddress);
  return membership ? getRuntimeWorkspaceMembership(walletAddress, membership.workspaceId) : null;
}

function getRuntimeWorkspaceMembership(walletAddress: string, workspaceId: string): WorkspaceMembership | null {
  const membership = MEMBERSHIPS.find((item) => item.walletAddress === walletAddress && item.workspaceId === workspaceId);
  const workspace = WORKSPACES.find((item) => item.id === workspaceId);

  return membership && workspace ? { ...membership, workspace } : null;
}

function createRuntimeWorkspace(name: string, slug: string): Workspace {
  const now = new Date().toISOString();
  const workspace = { id: randomUUID(), slug: `${slug}-${randomUUID().slice(0, 8)}`, name, createdAt: now, updatedAt: now };
  WORKSPACES.push(workspace);
  return workspace;
}

function ensureRuntimeWorkspace(workspaceId: string): Workspace {
  const existing = WORKSPACES.find((item) => item.id === workspaceId);

  if (existing) {
    return existing;
  }

  const now = new Date().toISOString();
  const workspace = { id: workspaceId, slug: workspaceId, name: workspaceId === DEFAULT_WORKSPACE_ID ? "Default Workspace" : workspaceId, createdAt: now, updatedAt: now };
  WORKSPACES.push(workspace);
  return workspace;
}

function parseWorkspaceWithMember(value: unknown, walletAddress: string): WorkspaceMembership {
  const row = value as { id?: string; slug?: string; name?: string; createdAt?: Date | string; updatedAt?: Date | string; members?: Array<{ walletAddress?: string; role?: string }> };
  const member = row.members?.find((item) => item.walletAddress === walletAddress) ?? row.members?.[0];

  return {
    workspaceId: String(row.id),
    walletAddress,
    role: workspaceRoleSchema.parse(member?.role),
    workspace: parseWorkspace(row)
  };
}

function parseWorkspaceMembership(value: unknown): WorkspaceMembership {
  const row = value as { workspaceId?: string; walletAddress?: string; role?: string; workspace?: unknown };

  return {
    workspaceId: String(row.workspaceId),
    walletAddress: String(row.walletAddress),
    role: workspaceRoleSchema.parse(row.role),
    workspace: parseWorkspace(row.workspace)
  };
}

function parseSupabaseWorkspaceMembership(workspaceId: string, walletAddress: string, role: unknown, workspace: unknown): WorkspaceMembership {
  return {
    workspaceId,
    walletAddress,
    role: workspaceRoleSchema.parse(role),
    workspace: parseWorkspace(workspace)
  };
}

function parseWorkspace(value: unknown): Workspace {
  const row = value as { id?: string; slug?: string; name?: string; createdAt?: Date | string; updatedAt?: Date | string };

  return {
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt)
  };
}

function slugifyWorkspace(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "workspace";
}
