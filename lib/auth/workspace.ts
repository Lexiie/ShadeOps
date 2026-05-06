import { z } from "zod";
import { requireWalletSession } from "@/lib/auth/session";
import { ensureRuntimeBootstrapMembers, getWorkspaceMembership } from "@/lib/workspace/store";

export const DEFAULT_WORKSPACE_ID = "default";
export const WORKSPACE_ID_HEADER = "x-shadeops-workspace-id";

export const workspaceRoleSchema = z.enum(["owner", "admin", "reviewer"]);

export type WorkspaceRole = z.infer<typeof workspaceRoleSchema>;

export type WorkspaceAccess = {
  workspaceId: string;
  walletAddress: string;
  role: WorkspaceRole;
};

const workspaceIdSchema = z.string().trim().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/, "Workspace id contains unsupported characters.");

/**
 * Requires a signed wallet session with one of the requested workspace roles.
 */
export async function requireWorkspaceRole(allowedRoles: WorkspaceRole[], workspaceId = DEFAULT_WORKSPACE_ID): Promise<WorkspaceAccess> {
  const session = await requireWalletSession();
  const role = await getWorkspaceRole(session.walletAddress, workspaceId);

  if (!role || !allowedRoles.includes(role)) {
    throw new Error("Signed wallet is not authorized for this workspace action.");
  }

  return { workspaceId, walletAddress: session.walletAddress, role };
}

export async function requireWorkspaceRoleForRequest(request: Request, allowedRoles: WorkspaceRole[]): Promise<WorkspaceAccess> {
  return requireWorkspaceRole(allowedRoles, getWorkspaceIdFromRequest(request));
}

export function getWorkspaceIdFromRequest(request: Request): string {
  const url = new URL(request.url);
  const requestedWorkspaceId = request.headers.get(WORKSPACE_ID_HEADER) ?? url.searchParams.get("workspaceId") ?? DEFAULT_WORKSPACE_ID;

  return workspaceIdSchema.parse(requestedWorkspaceId);
}

/**
 * Resolves a wallet's workspace role from environment allowlists.
 */
export async function getWorkspaceRole(walletAddress: string, workspaceId = DEFAULT_WORKSPACE_ID): Promise<WorkspaceRole | null> {
  const normalizedWallet = walletAddress.trim();
  seedRuntimeBootstrapMembers();

  const membership = await getWorkspaceMembership(normalizedWallet, workspaceId);

  if (membership) {
    return membership.role;
  }

  const configuredRoles = parseWorkspaceRoleConfig();
  const exactRole = configuredRoles.find((entry) => entry.workspaceId === workspaceId && entry.walletAddress === normalizedWallet)?.role;

  if (exactRole) {
    return exactRole;
  }

  if (configuredRoles.length === 0 && process.env.NODE_ENV !== "production") {
    return "owner";
  }

  return null;
}

/**
 * Parses SHADEOPS_WORKSPACE_MEMBERS as workspaceId:wallet:role CSV entries.
 */
function parseWorkspaceRoleConfig(): WorkspaceAccess[] {
  const rawMembers = process.env.SHADEOPS_WORKSPACE_MEMBERS;

  if (!rawMembers) {
    return [];
  }

  return rawMembers
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [workspaceId, walletAddress, role] = entry.split(":");

      return {
        workspaceId: workspaceId || DEFAULT_WORKSPACE_ID,
        walletAddress: walletAddress ?? "",
        role: workspaceRoleSchema.parse(role)
      };
    });
}

function seedRuntimeBootstrapMembers(): void {
  ensureRuntimeBootstrapMembers(parseWorkspaceRoleConfig());
}
