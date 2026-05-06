import { getPrismaClient } from "@/lib/db/prisma";
import { getSupabaseRestClient, SUPABASE_TABLES } from "@/lib/db/supabase";
import type { ExecutionPlan, ProofPackage } from "@/lib/schemas/proof";

type PayoutOperationDelegate = {
  upsert: (args: {
    where: { operationId: string };
    update: Record<string, unknown>;
    create: Record<string, unknown>;
  }) => Promise<unknown>;
};

type ProofRecordDelegate = {
  findMany: (args: { where: { workspaceId: string }; orderBy: { createdAt: "desc" }; take: number }) => Promise<unknown[]>;
  upsert: (args: {
    where: { operationId: string };
    update: Record<string, unknown>;
    create: Record<string, unknown>;
  }) => Promise<unknown>;
};

export type ProofRecordSummary = {
  operationId: string;
  decisionHash: string;
  adminWallet?: string;
  adminApprovedAt: string;
  createdAt: string;
};

const RUNTIME_PAYOUT_OPERATIONS = new Map<string, { workspaceId: string; plan: ExecutionPlan; treasuryWallet: string; adminWallet?: string; createdAt: string }>();
const RUNTIME_PROOF_RECORDS = new Map<string, { workspaceId: string; proofPackage: ProofPackage; adminWallet?: string; createdAt: string }>();

export async function savePayoutOperation(input: { workspaceId: string; plan: ExecutionPlan; treasuryWallet: string; adminWallet?: string }): Promise<void> {
  const data = {
    workspaceId: input.workspaceId,
    operationId: input.plan.operationId,
    treasuryWallet: input.treasuryWallet,
    parsedOperation: input.plan.parsedOperation,
    policyResult: input.plan.policyResult,
    routeDecision: input.plan.routeDecision,
    recipientSource: input.plan.parsedOperation.recipientLabel,
    adminWallet: input.adminWallet
  };
  const supabase = getSupabaseRestClient();

  if (supabase) {
    await supabase.upsert(SUPABASE_TABLES.payoutOperation, data, "operationId");
    return;
  }

  const delegate = await getPayoutOperationDelegate();

  if (!delegate) {
    RUNTIME_PAYOUT_OPERATIONS.set(input.plan.operationId, { ...input, createdAt: new Date().toISOString() });
    return;
  }

  await delegate.upsert({ where: { operationId: input.plan.operationId }, update: data, create: data });
}

export async function saveProofRecord(input: { workspaceId: string; proofPackage: ProofPackage; adminWallet?: string }): Promise<void> {
  const data = {
    workspaceId: input.workspaceId,
    operationId: input.proofPackage.operationId,
    proofPackage: input.proofPackage,
    decisionHash: input.proofPackage.decisionHash,
    adminWallet: input.adminWallet,
    adminApprovedAt: new Date(input.proofPackage.adminApprovalTimestamp)
  };
  const supabase = getSupabaseRestClient();

  if (supabase) {
    await supabase.upsert(SUPABASE_TABLES.proofRecord, data, "operationId");
    return;
  }

  const delegate = await getProofRecordDelegate();

  if (!delegate) {
    RUNTIME_PROOF_RECORDS.set(input.proofPackage.operationId, { ...input, createdAt: new Date().toISOString() });
    return;
  }

  await delegate.upsert({ where: { operationId: input.proofPackage.operationId }, update: data, create: data });
}

export async function listProofRecordsForWorkspace(workspaceId: string, take = 20): Promise<ProofRecordSummary[]> {
  const supabase = getSupabaseRestClient();

  if (supabase) {
    const rows = await supabase.selectMany(SUPABASE_TABLES.proofRecord, { workspaceId: `eq.${workspaceId}`, order: "createdAt.desc", limit: String(take) });
    return rows.map(parseProofRecordSummary);
  }

  const delegate = await getProofRecordDelegate();

  if (!delegate) {
    return [...RUNTIME_PROOF_RECORDS.values()]
      .filter((record) => record.workspaceId === workspaceId)
      .sort((first, second) => second.createdAt.localeCompare(first.createdAt))
      .slice(0, take)
      .map((record) => ({
        operationId: record.proofPackage.operationId,
        decisionHash: record.proofPackage.decisionHash,
        adminWallet: record.adminWallet,
        adminApprovedAt: record.proofPackage.adminApprovalTimestamp,
        createdAt: record.createdAt
      }));
  }

  const rows = await delegate.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" }, take });
  return rows.map(parseProofRecordSummary);
}

async function getPayoutOperationDelegate(): Promise<PayoutOperationDelegate | null> {
  const prisma = await getPrismaClient();
  const delegate = prisma?.payoutOperation;

  return isPayoutOperationDelegate(delegate) ? delegate : null;
}

async function getProofRecordDelegate(): Promise<ProofRecordDelegate | null> {
  const prisma = await getPrismaClient();
  const delegate = prisma?.proofRecord;

  return isProofRecordDelegate(delegate) ? delegate : null;
}

function isPayoutOperationDelegate(value: unknown): value is PayoutOperationDelegate {
  return Boolean(value && typeof value === "object" && "upsert" in value);
}

function isProofRecordDelegate(value: unknown): value is ProofRecordDelegate {
  return Boolean(value && typeof value === "object" && "findMany" in value && "upsert" in value);
}

function parseProofRecordSummary(value: unknown): ProofRecordSummary {
  const row = value as { operationId?: string; decisionHash?: string; adminWallet?: string | null; adminApprovedAt?: Date | string; createdAt?: Date | string };

  return {
    operationId: String(row.operationId),
    decisionHash: String(row.decisionHash),
    adminWallet: row.adminWallet ?? undefined,
    adminApprovedAt: row.adminApprovedAt instanceof Date ? row.adminApprovedAt.toISOString() : String(row.adminApprovedAt),
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt)
  };
}
