import { randomUUID } from "node:crypto";
import { getPrismaClient } from "@/lib/db/prisma";
import { getSupabaseRestClient, SUPABASE_TABLES } from "@/lib/db/supabase";
import { contactInputSchema, contactSchema, recipientResolutionSchema, type Contact, type ContactInput, type RecipientResolution } from "@/lib/schemas/contact";
import type { ParsedPayoutOperation } from "@/lib/schemas/payout";

const DEFAULT_WORKSPACE_ID = "default";

type ContactDelegate = {
  findMany: (args: { where: { workspaceId: string }; orderBy: { updatedAt: "desc" } }) => Promise<unknown[]>;
  upsert: (args: {
    where: { workspaceId_label: { workspaceId: string; label: string } };
    update: Record<string, unknown>;
    create: Record<string, unknown>;
  }) => Promise<unknown>;
};

const CONTACTS: Contact[] = [
  {
    id: "alice",
    label: "Alice",
    walletAddress: "4Ym2txdd8uvG8uo39Vnrqwa7fZNQWJeRaoQTSJiK67HH",
    role: "contributor",
    allowedTokens: ["USDC", "USDT", "SOL"],
    status: "active",
    source: "Team contributor list",
    updatedAt: "2026-04-28T00:00:00.000Z"
  },
  {
    id: "orbit-vendors",
    label: "Orbit Vendors",
    walletAddress: "8MWThDXLJq5UwogtDm92PEvYVLbd58HNJtVT7gmVHfgX",
    role: "vendor",
    allowedTokens: ["USDC"],
    status: "active",
    source: "Approved vendor registry",
    updatedAt: "2026-04-28T00:00:00.000Z"
  },
  {
    id: "maya",
    label: "Maya",
    walletAddress: "ECNGa5typxnu5N89izerq3zuK1ZFcLvZVft4Mzao5Yat",
    role: "grantee",
    allowedTokens: ["USDC"],
    status: "needs_review",
    source: "Grant committee intake",
    updatedAt: "2026-04-28T00:00:00.000Z"
  }
];

/**
 * Returns the operator address book used to resolve payout recipients.
 */
export function listContacts(): Contact[] {
  return CONTACTS.map((contact) => contactSchema.parse(contact));
}

/**
 * Returns contacts from Prisma when configured, otherwise from the runtime demo store.
 */
export async function listContactsForWorkspace(workspaceId = DEFAULT_WORKSPACE_ID): Promise<Contact[]> {
  const supabase = getSupabaseRestClient();

  if (supabase) {
    const rows = await supabase.selectMany(SUPABASE_TABLES.contact, { workspaceId: `eq.${workspaceId}`, order: "updatedAt.desc" });
    return rows.map(parseDbContact);
  }

  const delegate = await getContactDelegate();

  if (!delegate) {
    return listContacts();
  }

  const rows = await delegate.findMany({ where: { workspaceId }, orderBy: { updatedAt: "desc" } });

  return rows.map(parseDbContact);
}

/**
 * Adds or updates a contact for the running Next.js process.
 */
export function upsertContact(input: ContactInput): Contact {
  const parsed = contactInputSchema.parse(input);
  const contact = contactSchema.parse({
    ...parsed,
    id: parsed.id ?? slugifyContactId(parsed.label),
    label: parsed.label.trim(),
    allowedTokens: parsed.allowedTokens.map((token) => token.toUpperCase()),
    updatedAt: new Date().toISOString()
  });
  const existingIndex = CONTACTS.findIndex((item) => item.id === contact.id);

  if (existingIndex >= 0) {
    CONTACTS[existingIndex] = contact;
  } else {
    CONTACTS.unshift(contact);
  }

  return contact;
}

/**
 * Adds or updates a contact in Prisma when configured, otherwise in the runtime demo store.
 */
export async function upsertContactForWorkspace(input: ContactInput, workspaceId = DEFAULT_WORKSPACE_ID): Promise<Contact> {
  const parsed = contactInputSchema.parse(input);
  const label = parsed.label.trim();
  const allowedTokens = parsed.allowedTokens.map((token) => token.toUpperCase());
  const data = {
    id: parsed.id ?? `${workspaceId}-${slugifyContactId(label)}`,
    workspaceId,
    label,
    walletAddress: parsed.walletAddress,
    role: parsed.role,
    allowedTokens,
    status: parsed.status,
    source: parsed.source
  };
  const supabase = getSupabaseRestClient();

  if (supabase) {
    return parseDbContact(await supabase.upsert(SUPABASE_TABLES.contact, data, "workspaceId,label"));
  }

  const delegate = await getContactDelegate();

  if (!delegate) {
    return upsertContact(parsed);
  }

  const row = await delegate.upsert({
    where: { workspaceId_label: { workspaceId, label } },
    update: {
      walletAddress: parsed.walletAddress,
      role: parsed.role,
      allowedTokens,
      status: parsed.status,
      source: parsed.source
    },
    create: {
      workspaceId,
      label,
      walletAddress: parsed.walletAddress,
      role: parsed.role,
      allowedTokens,
      status: parsed.status,
      source: parsed.source
    }
  });

  return parseDbContact(row);
}

/**
 * Resolves a parsed recipient label to a deterministic contact wallet when possible.
 */
export function resolveRecipient(operation: ParsedPayoutOperation): { operation: ParsedPayoutOperation; resolution: RecipientResolution } {
  if (operation.recipientWallet) {
    return {
      operation,
      resolution: recipientResolutionSchema.parse({
        status: "resolved",
        source: "intent",
        label: operation.recipientLabel,
        walletAddress: operation.recipientWallet,
        message: "Wallet address was provided in the payout intent."
      })
    };
  }

  const contact = findContactByLabel(operation.recipientLabel);

  if (!contact || contact.status !== "active" || !contact.allowedTokens.includes(operation.tokenSymbol.toUpperCase())) {
    return {
      operation,
      resolution: recipientResolutionSchema.parse({
        status: "unresolved",
        source: "manual_required",
        label: operation.recipientLabel,
        message: contact
          ? `${contact.label} exists, but status or token permissions require admin review.`
          : `No active address book match found for ${operation.recipientLabel}.`
      })
    };
  }

  return {
    operation: { ...operation, recipientWallet: contact.walletAddress },
    resolution: recipientResolutionSchema.parse({
      status: "resolved",
      source: "address_book",
      label: contact.label,
      walletAddress: contact.walletAddress,
      message: `Resolved ${contact.label} from the address book.`
    })
  };
}

/**
 * Resolves a parsed recipient against the persistent contact repository when available.
 */
export async function resolveRecipientForWorkspace(operation: ParsedPayoutOperation, workspaceId = DEFAULT_WORKSPACE_ID): Promise<{ operation: ParsedPayoutOperation; resolution: RecipientResolution }> {
  if (operation.recipientWallet) {
    return resolveRecipient(operation);
  }

  const contacts = await listContactsForWorkspace(workspaceId);
  return resolveRecipientFromContacts(operation, contacts);
}

/**
 * Resolves a parsed recipient against an explicit contact list.
 */
function resolveRecipientFromContacts(operation: ParsedPayoutOperation, contacts: Contact[]): { operation: ParsedPayoutOperation; resolution: RecipientResolution } {
  if (operation.recipientWallet) {
    return resolveRecipient(operation);
  }

  const normalizedLabel = normalize(operation.recipientLabel);
  const contact = contacts.find((item) => normalize(item.label) === normalizedLabel || item.id === normalizedLabel);

  if (!contact || contact.status !== "active" || !contact.allowedTokens.includes(operation.tokenSymbol.toUpperCase())) {
    return {
      operation,
      resolution: recipientResolutionSchema.parse({
        status: "unresolved",
        source: "manual_required",
        label: operation.recipientLabel,
        message: contact
          ? `${contact.label} exists, but status or token permissions require admin review.`
          : `No active address book match found for ${operation.recipientLabel}.`
      })
    };
  }

  return {
    operation: { ...operation, recipientWallet: contact.walletAddress },
    resolution: recipientResolutionSchema.parse({
      status: "resolved",
      source: "address_book",
      label: contact.label,
      walletAddress: contact.walletAddress,
      message: `Resolved ${contact.label} from the address book.`
    })
  };
}

async function getContactDelegate(): Promise<ContactDelegate | null> {
  const prisma = await getPrismaClient();
  const delegate = prisma?.contact;

  return isContactDelegate(delegate) ? delegate : null;
}

function isContactDelegate(value: unknown): value is ContactDelegate {
  return Boolean(value && typeof value === "object" && "findMany" in value && "upsert" in value);
}

function parseDbContact(value: unknown): Contact {
  const row = value as { id?: string; label?: string; walletAddress?: string; role?: string; allowedTokens?: unknown; status?: string; source?: string; updatedAt?: Date | string };
  const allowedTokens = Array.isArray(row.allowedTokens) ? row.allowedTokens : [];

  return contactSchema.parse({
    id: row.id,
    label: row.label,
    walletAddress: row.walletAddress,
    role: row.role,
    allowedTokens,
    status: row.status,
    source: row.source,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt
  });
}

/**
 * Finds a contact by case-insensitive label or simple slug.
 */
function findContactByLabel(label: string): Contact | undefined {
  const normalizedLabel = normalize(label);

  return CONTACTS.find((contact) => normalize(contact.label) === normalizedLabel || contact.id === normalizedLabel);
}

/**
 * Creates stable human-readable ids for contacts entered in the dashboard.
 */
function slugifyContactId(label: string): string {
  const slug = normalize(label).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return slug || randomUUID();
}

/**
 * Normalizes names used for deterministic recipient matching.
 */
function normalize(value: string): string {
  return value.trim().toLowerCase();
}
