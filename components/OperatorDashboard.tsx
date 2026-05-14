"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { AlertTriangle, BookUser, CheckCircle2, ChevronDown, ClipboardCheck, Database, FileText, Plus, Search, ShieldCheck, WalletCards } from "lucide-react";
import Link from "next/link";
import type { FormEvent, ReactElement, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import bs58 from "bs58";
import { ShadeOpsLogo } from "@/components/ShadeOpsLogo";
import type { Contact, ContactInput } from "@/lib/schemas/contact";
import type { TreasuryConfig, TreasuryConfigInput } from "@/lib/schemas/treasury";
import { cn } from "@/lib/utils";

type ContactDraft = {
  label: string;
  walletAddress: string;
  role: Contact["role"];
  allowedTokens: string;
  status: Contact["status"];
  source: string;
};

type ContactResponse = {
  contacts: Contact[];
};

type TreasuryConfigResponse = {
  treasuryConfig: TreasuryConfig | null;
};

type ProofRecordSummary = {
  operationId: string;
  decisionHash: string;
  adminWallet?: string;
  adminApprovedAt: string;
  createdAt: string;
};

type WorkspaceMembership = {
  workspaceId: string;
  walletAddress: string;
  role: "owner" | "admin" | "reviewer";
  workspace: {
    id: string;
    slug: string;
    name: string;
  };
};

type TreasuryDraft = {
  label: string;
  walletAddress: string;
  network: TreasuryConfig["network"];
  source: TreasuryConfig["source"];
};

const DEFAULT_DRAFT: ContactDraft = {
  label: "",
  walletAddress: "",
  role: "contributor",
  allowedTokens: "USDC,USDT,SOL",
  status: "active",
  source: "Manual dashboard entry"
};

const SAMPLE_INTENT = "Pay Alice 50 USDC privately for the bounty round.";
const WORKSPACE_ID_HEADER = "x-shadeops-workspace-id";
const DEFAULT_TREASURY_DRAFT: TreasuryDraft = {
  label: "Core Ops Treasury",
  walletAddress: "",
  network: "devnet",
  source: "manual"
};

/**
 * Renders the dashboard that makes recipient resolution explicit and auditable.
 */
export function OperatorDashboard(): ReactElement {
  const { connected, connecting, publicKey, signMessage } = useWallet();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [proofRecords, setProofRecords] = useState<ProofRecordSummary[]>([]);
  const [draft, setDraft] = useState<ContactDraft>(DEFAULT_DRAFT);
  const [treasuryDraft, setTreasuryDraft] = useState<TreasuryDraft>(DEFAULT_TREASURY_DRAFT);
  const [treasuryConfig, setTreasuryConfig] = useState<TreasuryConfig | null>(null);
  const [workspaceMembership, setWorkspaceMembership] = useState<WorkspaceMembership | null>(null);
  const [workspaceName, setWorkspaceName] = useState("ShadeOps Workspace");
  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState(false);
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);
  const [intent, setIntent] = useState(SAMPLE_INTENT);
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);
  const [isSavingTreasury, setIsSavingTreasury] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolverPreview = useMemo(() => resolveIntentPreview(intent, contacts), [contacts, intent]);

  useEffect(() => {
    if (!connected || !publicKey) {
      setIsAuthenticated(false);
      setWorkspaceMembership(null);
      setContacts([]);
      return;
    }

    let isMounted = true;
    const walletAddress = publicKey.toBase58();

    async function loadSession(): Promise<void> {
      const response = await fetch("/api/auth/session");
      const payload = (await response.json()) as { session: { walletAddress: string } | null };

      if (isMounted) {
        setIsAuthenticated(payload.session?.walletAddress === walletAddress);
      }
    }

    void loadSession();

    return () => {
      isMounted = false;
    };
  }, [connected, publicKey]);

  useEffect(() => {
    if (!connected || !isAuthenticated) {
      setWorkspaceMembership(null);
      return;
    }

    let isMounted = true;

    async function loadWorkspace(): Promise<void> {
      setIsLoadingWorkspace(true);
      setError(null);

      try {
        const response = await fetch("/api/workspaces");

        if (!response.ok) {
          throw new Error(await readApiError(response));
        }

        const payload = (await response.json()) as { membership: WorkspaceMembership | null };

        if (isMounted) {
          setWorkspaceMembership(payload.membership);
        }
      } catch (caughtError) {
        if (isMounted) {
          setError(caughtError instanceof Error ? caughtError.message : "Unable to load workspace.");
        }
      } finally {
        if (isMounted) {
          setIsLoadingWorkspace(false);
        }
      }
    }

    void loadWorkspace();

    return () => {
      isMounted = false;
    };
  }, [connected, isAuthenticated]);

  useEffect(() => {
    if (!connected || !isAuthenticated || !workspaceMembership) {
      setContacts([]);
      return;
    }

    let isMounted = true;

    async function loadDashboardData(): Promise<void> {
      setIsLoadingContacts(true);
      setError(null);

      try {
        const headers = workspaceHeaders(workspaceMembership);
        const [contactsResponse, treasuryResponse, proofResponse] = await Promise.all([fetch("/api/contacts", { headers }), fetch("/api/treasury/config", { headers }), fetch("/api/payout/proof", { headers })]);

        if (!contactsResponse.ok) {
          throw new Error(await readApiError(contactsResponse));
        }

        if (!treasuryResponse.ok) {
          throw new Error(await readApiError(treasuryResponse));
        }

        if (!proofResponse.ok) {
          throw new Error(await readApiError(proofResponse));
        }

        const contactsPayload = (await contactsResponse.json()) as ContactResponse;
        const treasuryPayload = (await treasuryResponse.json()) as TreasuryConfigResponse;
        const proofPayload = (await proofResponse.json()) as { proofRecords: ProofRecordSummary[] };

        if (isMounted) {
          setContacts(contactsPayload.contacts);
          setProofRecords(proofPayload.proofRecords);
          setTreasuryConfig(treasuryPayload.treasuryConfig);

          if (treasuryPayload.treasuryConfig) {
            setTreasuryDraft({
              label: treasuryPayload.treasuryConfig.label,
              walletAddress: treasuryPayload.treasuryConfig.walletAddress,
              network: treasuryPayload.treasuryConfig.network,
              source: treasuryPayload.treasuryConfig.source
            });
          }
        }
      } catch (caughtError) {
        if (isMounted) {
          setError(caughtError instanceof Error ? caughtError.message : "Unable to load contacts.");
        }
      } finally {
        if (isMounted) {
          setIsLoadingContacts(false);
        }
      }
    }

    void loadDashboardData();

    return () => {
      isMounted = false;
    };
  }, [connected, isAuthenticated, workspaceMembership]);

  async function handleCreateWorkspace(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setIsCreatingWorkspace(true);
    setError(null);

    try {
      const response = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: workspaceName })
      });

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      const payload = (await response.json()) as { membership: WorkspaceMembership };
      setWorkspaceMembership(payload.membership);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to create workspace.");
    } finally {
      setIsCreatingWorkspace(false);
    }
  }

  async function handleWalletSignIn(): Promise<void> {
    if (!publicKey || !signMessage) {
      setError("Connect a wallet that supports message signing.");
      return;
    }

    setIsSigningIn(true);
    setError(null);

    try {
      const challengeResponse = await fetch("/api/auth/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: publicKey.toBase58() })
      });

      if (!challengeResponse.ok) {
        throw new Error(await readApiError(challengeResponse));
      }

      const { message } = (await challengeResponse.json()) as { message: string };
      const signature = await signMessage(new TextEncoder().encode(message));
      const verifyResponse = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: publicKey.toBase58(), signature: bs58.encode(signature) })
      });

      if (!verifyResponse.ok) {
        throw new Error(await readApiError(verifyResponse));
      }

      setIsAuthenticated(true);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to authenticate wallet.");
    } finally {
      setIsSigningIn(false);
    }
  }

  async function handleSaveContact(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setIsSaving(true);
    setError(null);

    try {
      const payload: ContactInput = {
        label: draft.label,
        walletAddress: draft.walletAddress,
        role: draft.role,
        allowedTokens: draft.allowedTokens.split(",").map((token) => token.trim().toUpperCase()).filter(Boolean),
        status: draft.status,
        source: draft.source
      };
      const response = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...workspaceHeaders(workspaceMembership) },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      const result = (await response.json()) as { contact: Contact };
      setContacts((current) => [result.contact, ...current.filter((contact) => contact.id !== result.contact.id)]);
      setDraft(DEFAULT_DRAFT);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to save contact.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveTreasury(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setIsSavingTreasury(true);
    setError(null);

    try {
      const payload: TreasuryConfigInput = treasuryDraft;
      const response = await fetch("/api/treasury/config", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...workspaceHeaders(workspaceMembership) },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      const result = (await response.json()) as { treasuryConfig: TreasuryConfig };
      setTreasuryConfig(result.treasuryConfig);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to save treasury config.");
    } finally {
      setIsSavingTreasury(false);
    }
  }

  if (!connected || !isAuthenticated) {
    return <DashboardAccessGate connecting={connecting} isSigningIn={isSigningIn} isConnected={connected} error={error} onSignIn={handleWalletSignIn} />;
  }

  if (isLoadingWorkspace || !workspaceMembership) {
    return <WorkspaceOnboarding isLoading={isLoadingWorkspace} isCreating={isCreatingWorkspace} error={error} workspaceName={workspaceName} onWorkspaceNameChange={setWorkspaceName} onCreateWorkspace={handleCreateWorkspace} />;
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <DashboardHeader />
      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[15rem_1fr] lg:px-8">
        <aside className="hidden border-r border-border pr-4 lg:block">
          <nav className="sticky top-20 space-y-1 text-sm" aria-label="Dashboard sections">
            <SideLink href="#contacts" icon={<BookUser aria-hidden className="h-4 w-4" />} label="Contacts" active />
            <SideLink href="#treasury" icon={<WalletCards aria-hidden className="h-4 w-4" />} label="Treasury" />
            <SideLink href="#resolver" icon={<Search aria-hidden className="h-4 w-4" />} label="Resolver" />
            <SideLink href="#policy" icon={<ShieldCheck aria-hidden className="h-4 w-4" />} label="Policy" />
            <SideLink href="#proof" icon={<FileText aria-hidden className="h-4 w-4" />} label="Proof log" />
          </nav>
        </aside>

        <section className="min-w-0 space-y-5">
          <div className="grid gap-4 lg:grid-cols-4">
            <MetricTile label="Active contacts" value={isLoadingContacts ? "..." : String(contacts.filter((contact) => contact.status === "active").length)} detail="resolver ready" icon={<BookUser aria-hidden className="h-4 w-4" />} />
            <MetricTile label="Review queue" value={isLoadingContacts ? "..." : String(contacts.filter((contact) => contact.status === "needs_review").length)} detail="manual checks" icon={<AlertTriangle aria-hidden className="h-4 w-4" />} tone="review" />
            <MetricTile label="Treasury" value={treasuryConfig ? treasuryConfig.network : "Unset"} detail={treasuryConfig ? truncateAddress(treasuryConfig.walletAddress) : "configure first"} icon={<WalletCards aria-hidden className="h-4 w-4" />} tone={treasuryConfig ? "default" : "review"} />
            <MetricTile label="Proof records" value={isLoadingContacts ? "..." : String(proofRecords.length)} detail={proofRecords[0] ? truncateAddress(proofRecords[0].decisionHash) : "none yet"} icon={<ClipboardCheck aria-hidden className="h-4 w-4" />} />
          </div>

          {error ? <Alert message={error} /> : null}

          <div className="grid gap-5 xl:grid-cols-[1fr_0.72fr]">
            <Panel id="contacts" title="Recipient address book" icon={<BookUser aria-hidden className="h-4 w-4" />} action={<StatusBadge label="source" tone="info" />}>
              <div className="space-y-2 md:hidden">
                {isLoadingContacts ? <MobileContactSkeleton /> : contacts.map((contact) => <MobileContactCard key={contact.id} contact={contact} />)}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[760px] border-separate border-spacing-0 text-left text-sm">
                  <thead className="text-xs uppercase text-muted-foreground">
                    <tr>
                      <TableHead>Name</TableHead>
                      <TableHead>Wallet</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Tokens</TableHead>
                      <TableHead>Status</TableHead>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoadingContacts ? <SkeletonRows /> : contacts.map((contact) => <ContactRow key={contact.id} contact={contact} />)}
                  </tbody>
                </table>
              </div>
            </Panel>

            <Panel title="Add recipient" icon={<Plus aria-hidden className="h-4 w-4" />}>
              <form className="space-y-3" onSubmit={handleSaveContact}>
                <Field label="Name" id="contact-name">
                  <input id="contact-name" value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} required className="control" autoComplete="name" />
                </Field>
                <Field label="Wallet address" id="contact-wallet">
                  <input id="contact-wallet" value={draft.walletAddress} onChange={(event) => setDraft({ ...draft, walletAddress: event.target.value })} required className="control font-mono text-xs" autoComplete="off" spellCheck={false} />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Role" id="contact-role">
                    <select id="contact-role" value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value as Contact["role"] })} className="control">
                      <option value="contributor">Contributor</option>
                      <option value="vendor">Vendor</option>
                      <option value="grantee">Grantee</option>
                      <option value="contractor">Contractor</option>
                      <option value="operator">Operator</option>
                    </select>
                  </Field>
                  <Field label="Status" id="contact-status">
                    <select id="contact-status" value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as Contact["status"] })} className="control">
                      <option value="active">Active</option>
                      <option value="needs_review">Needs review</option>
                      <option value="blocked">Blocked</option>
                    </select>
                  </Field>
                </div>
                <Field label="Allowed tokens" id="contact-tokens">
                  <input id="contact-tokens" value={draft.allowedTokens} onChange={(event) => setDraft({ ...draft, allowedTokens: event.target.value })} className="control font-mono text-xs" autoComplete="off" />
                </Field>
                <Field label="Source" id="contact-source">
                  <input id="contact-source" value={draft.source} onChange={(event) => setDraft({ ...draft, source: event.target.value })} className="control" autoComplete="off" />
                </Field>
                <button type="submit" disabled={isSaving} className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground ring-offset-background hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60">
                  <Plus aria-hidden className="h-4 w-4" />
                  {isSaving ? "Saving contact..." : "Save recipient"}
                </button>
              </form>
            </Panel>
          </div>

          <Panel id="treasury" title="Treasury settings" icon={<WalletCards aria-hidden className="h-4 w-4" />} action={<StatusBadge label={treasuryConfig ? "configured" : "required"} tone={treasuryConfig ? "pass" : "review"} />}>
            <TreasuryEducation />
            <form className="mt-4 grid gap-3 lg:grid-cols-[1fr_1.1fr_auto_auto] lg:items-end" onSubmit={handleSaveTreasury}>
              <Field label="Treasury label" id="treasury-label">
                <input id="treasury-label" value={treasuryDraft.label} onChange={(event) => setTreasuryDraft({ ...treasuryDraft, label: event.target.value })} required className="control" autoComplete="organization" />
              </Field>
              <Field label="Treasury wallet address" id="treasury-wallet">
                <input id="treasury-wallet" value={treasuryDraft.walletAddress} onChange={(event) => setTreasuryDraft({ ...treasuryDraft, walletAddress: event.target.value })} required className="control font-mono text-xs" autoComplete="off" spellCheck={false} />
              </Field>
              <Field label="Network" id="treasury-network">
                <select id="treasury-network" value={treasuryDraft.network} onChange={(event) => setTreasuryDraft({ ...treasuryDraft, network: event.target.value as TreasuryConfig["network"] })} className="control">
                  <option value="devnet">Devnet</option>
                </select>
              </Field>
              <Field label="Source" id="treasury-source">
                <select id="treasury-source" value={treasuryDraft.source} onChange={(event) => setTreasuryDraft({ ...treasuryDraft, source: event.target.value as TreasuryConfig["source"] })} className="control">
                  <option value="manual">Manual</option>
                  <option value="squads">Squads</option>
                  <option value="realms">Realms</option>
                  <option value="program">Program</option>
                </select>
              </Field>
              <button type="submit" disabled={isSavingTreasury} className="inline-flex min-h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground ring-offset-background hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 lg:col-span-4">
                {isSavingTreasury ? "Saving treasury..." : "Save treasury settings"}
              </button>
            </form>
          </Panel>

          <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
            <Panel id="resolver" title="Intent resolver" icon={<Search aria-hidden className="h-4 w-4" />} action={<StatusBadge label={resolverPreview.status === "resolved" ? "resolved" : "needs wallet"} tone={resolverPreview.status === "resolved" ? "pass" : "review"} />}>
              <div className="space-y-3">
                <Field label="Payout intent" id="resolver-intent">
                  <textarea id="resolver-intent" value={intent} onChange={(event) => setIntent(event.target.value)} className="control min-h-28 resize-y leading-6" />
                </Field>
                <div className="grid gap-3 sm:grid-cols-3">
                  <ResolverMetric label="Recipient" value={resolverPreview.label} />
                  <ResolverMetric label="Amount" value={resolverPreview.amount} mono />
                  <ResolverMetric label="Token" value={resolverPreview.token} mono />
                </div>
                <div className={cn("rounded-md border px-3 py-3", resolverPreview.status === "resolved" ? "border-primary/30 bg-primary/10" : "border-accent/40 bg-accent/10")}>
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Wallet resolution</p>
                  <p className="mt-1 break-all font-mono text-xs text-foreground">{resolverPreview.walletAddress ?? "Manual wallet required before execution."}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{resolverPreview.message}</p>
                </div>
              </div>
            </Panel>

            <Panel id="policy" title="Treasury and policy lanes" icon={<Database aria-hidden className="h-4 w-4" />}>
              <div className="grid gap-3 md:grid-cols-2">
                <PolicyLane title="Treasury context" status="configured" lines={["Zerion API or CLI observes wallet holdings", "Solana RPC verifies exact spendable balance", "Devnet mode remains visible in every approval flow"]} />
                <PolicyLane title="Recipient rules" status="enforced" lines={["Address book match required for named recipients", "Needs-review contacts cannot auto-resolve", "Token permissions are checked before signing"]} />
                <PolicyLane title="Amount checks" status="deterministic" lines={["Standard payouts pass below threshold", "Large payouts require manual review", "Hard limit blocks execution preparation"]} />
                <PolicyLane title="Admin authority" status="required" lines={["AI only drafts structured intent", "Wallet approval signs every transaction", "Policy result is recorded in proof"]} />
              </div>
            </Panel>
          </div>

          <Panel id="proof" title="Recent proof log" icon={<FileText aria-hidden className="h-4 w-4" />} action={<Link href="/payout" className="inline-flex min-h-8 items-center rounded-md border border-border bg-secondary px-3 text-xs font-semibold text-secondary-foreground hover:bg-secondary/80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">Open console</Link>}>
            <div className="grid gap-2">
              {proofRecords.length > 0 ? proofRecords.map((record) => (
                <ProofRow key={record.operationId} operation={truncateAddress(record.operationId)} recipient={record.adminWallet ? truncateAddress(record.adminWallet) : "admin wallet"} route="recorded" status={new Date(record.adminApprovedAt).toLocaleDateString()} hash={truncateAddress(record.decisionHash)} />
              )) : (
                <div className="rounded-md border border-dashed border-border bg-background px-3 py-4 text-sm text-muted-foreground">No proof records have been stored for this workspace yet.</div>
              )}
            </div>
          </Panel>
        </section>
      </div>
    </main>
  );
}

function DashboardAccessGate({ connecting, isConnected, isSigningIn, error, onSignIn }: Readonly<{ connecting: boolean; isConnected: boolean; isSigningIn: boolean; error: string | null; onSignIn: () => void }>): ReactElement {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <DashboardHeader />
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl items-center px-4 py-10 sm:px-6">
        <div className="w-full rounded-lg border border-border bg-card p-5 sm:p-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-secondary text-primary">
            <WalletCards aria-hidden className="h-5 w-5" />
          </div>
          <p className="mt-5 text-xs font-semibold uppercase text-primary">Wallet required</p>
          <h1 className="mt-3 text-2xl font-medium tracking-normal text-foreground sm:text-3xl">Connect and sign to open the dashboard.</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Contacts, treasury settings, policy lanes, and proof records are operator surfaces. The payout console remains visible, but dashboard data requires a signed wallet session.
          </p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
            <WalletMultiButton className="!h-10 !min-w-36 !justify-center !rounded-md !bg-primary !px-4 !text-xs !font-semibold !leading-none !text-primary-foreground hover:!bg-primary/90" />
            <button
              type="button"
              onClick={onSignIn}
              disabled={!isConnected || isSigningIn}
              className="inline-flex min-h-10 items-center justify-center rounded-md bg-primary px-4 text-xs font-semibold text-primary-foreground ring-offset-background hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSigningIn ? "Signing..." : "Sign wallet session"}
            </button>
            <Link href="/payout" className="inline-flex min-h-10 items-center justify-center rounded-md border border-border bg-secondary px-4 text-xs font-semibold text-secondary-foreground hover:bg-secondary/80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
              Open payout console
            </Link>
          </div>
          {error ? <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p> : null}
          <p className="mt-3 text-xs text-muted-foreground">{connecting ? "Waiting for wallet approval..." : isConnected ? "Wallet connected. Sign the session challenge to continue." : "No wallet connected."}</p>
        </div>
      </section>
    </main>
  );
}

function WorkspaceOnboarding({ isLoading, isCreating, error, workspaceName, onWorkspaceNameChange, onCreateWorkspace }: Readonly<{ isLoading: boolean; isCreating: boolean; error: string | null; workspaceName: string; onWorkspaceNameChange: (value: string) => void; onCreateWorkspace: (event: FormEvent<HTMLFormElement>) => void }>): ReactElement {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <DashboardHeader />
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl items-center px-4 py-10 sm:px-6">
        <div className="w-full rounded-lg border border-border bg-card p-5 sm:p-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-secondary text-primary">
            <Database aria-hidden className="h-5 w-5" />
          </div>
          <p className="mt-5 text-xs font-semibold uppercase text-primary">Workspace setup</p>
          <h1 className="mt-3 text-2xl font-medium tracking-normal text-foreground sm:text-3xl">Create your first ShadeOps workspace.</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            This wallet will become the workspace owner. After that you can add treasury settings, contacts, and invite more operator wallets.
          </p>
          {isLoading ? (
            <div className="mt-5 space-y-3">
              <span className="block h-10 rounded-md bg-secondary" />
              <span className="block h-10 rounded-md bg-secondary" />
            </div>
          ) : (
            <form className="mt-5 space-y-3" onSubmit={onCreateWorkspace}>
              <Field label="Workspace name" id="workspace-name">
                <input id="workspace-name" value={workspaceName} onChange={(event) => onWorkspaceNameChange(event.target.value)} required className="control" autoComplete="organization" />
              </Field>
              <button type="submit" disabled={isCreating} className="inline-flex min-h-10 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground ring-offset-background hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60">
                {isCreating ? "Creating workspace..." : "Create workspace"}
              </button>
            </form>
          )}
          {error ? <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p> : null}
        </div>
      </section>
    </main>
  );
}

function DashboardHeader(): ReactElement {
  return (
    <header className="sticky top-0 z-50 border-b border-primary/30 bg-primary text-primary-foreground shadow-[0_12px_36px_rgba(0,0,0,0.18)]">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="inline-flex shrink-0 focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-primary-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-primary" aria-label="ShadeOps home">
          <ShadeOpsLogo />
        </Link>
        <div className="mx-auto hidden h-10 w-full max-w-xl items-center gap-3 rounded-full bg-primary-foreground/92 px-4 text-sm text-background md:flex">
          <Search aria-hidden className="h-4 w-4 text-muted-foreground" />
          <span className="truncate text-muted-foreground">Contacts, policies, proof records</span>
        </div>
        <nav className="flex shrink-0 items-center justify-end gap-2" aria-label="Dashboard navigation">
          <details className="relative">
            <summary className="inline-flex h-10 cursor-pointer list-none items-center justify-center gap-1.5 rounded-md border border-primary-foreground/35 bg-primary-foreground/12 px-3 text-xs font-semibold text-primary-foreground hover:bg-primary-foreground/18 focus-visible:ring-2 focus-visible:ring-primary-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-primary [&::-webkit-details-marker]:hidden">
              Nav
              <ChevronDown aria-hidden className="h-3.5 w-3.5" />
            </summary>
            <div className="absolute right-0 top-12 w-44 rounded-md border border-border bg-card p-1 text-foreground shadow-[0_18px_48px_rgba(0,0,0,0.28)]">
              <Link href="/dashboard" className="flex min-h-10 items-center rounded-md px-3 text-sm hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                Dashboard
              </Link>
              <Link href="/payout" className="flex min-h-10 items-center rounded-md px-3 text-sm hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                Payout
              </Link>
            </div>
          </details>
          <StatusBadge label="Devnet" tone="nav" />
          <span className="hidden sm:block">
            <WalletMultiButton className="!h-10 !min-w-36 !justify-center !rounded-md !bg-background !px-3 !text-xs !font-semibold !leading-none !text-foreground hover:!bg-background/92" />
          </span>
        </nav>
      </div>
    </header>
  );
}

function SideLink({ href, icon, label, active = false }: Readonly<{ href: string; icon: ReactNode; label: string; active?: boolean }>): ReactElement {
  return (
    <a className={cn("flex min-h-10 items-center gap-2 rounded-md px-3 text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2", active && "bg-secondary text-foreground")} href={href}>
      {icon}
      {label}
    </a>
  );
}

function Panel({ id, title, icon, action, children }: Readonly<{ id?: string; title: string; icon: ReactNode; action?: ReactNode; children: ReactNode }>): ReactElement {
  return (
    <section id={id} className="rounded-lg border border-border bg-card p-4">
      <div className="mb-4 flex items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-secondary text-primary">{icon}</span>
          <h2 className="truncate text-sm font-medium uppercase tracking-normal text-muted-foreground">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function MetricTile({ label, value, detail, icon, tone = "default" }: Readonly<{ label: string; value: string; detail: string; icon: ReactNode; tone?: "default" | "review" }>): ReactElement {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs uppercase text-muted-foreground">{label}</p>
        <span className={cn("flex h-8 w-8 items-center justify-center rounded-md bg-secondary text-primary", tone === "review" && "text-accent")}>{icon}</span>
      </div>
      <p className="mt-3 font-mono text-2xl font-semibold tabular-nums text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </section>
  );
}

function Field({ label, id, children }: Readonly<{ label: string; id: string; children: ReactNode }>): ReactElement {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold uppercase text-muted-foreground" htmlFor={id}>{label}</label>
      {children}
    </div>
  );
}

function TableHead({ children }: Readonly<{ children: ReactNode }>): ReactElement {
  return <th className="border-b border-border px-3 py-2 font-semibold">{children}</th>;
}

function ContactRow({ contact }: Readonly<{ contact: Contact }>): ReactElement {
  return (
    <tr className="border-b border-border">
      <td className="border-b border-border px-3 py-3 font-medium text-foreground">{contact.label}</td>
      <td className="border-b border-border px-3 py-3 font-mono text-xs text-muted-foreground">{truncateAddress(contact.walletAddress)}</td>
      <td className="border-b border-border px-3 py-3 text-muted-foreground">{formatLabel(contact.role)}</td>
      <td className="border-b border-border px-3 py-3 font-mono text-xs text-muted-foreground">{contact.allowedTokens.join(", ")}</td>
      <td className="border-b border-border px-3 py-3"><StatusBadge label={formatLabel(contact.status)} tone={contact.status === "active" ? "pass" : contact.status === "blocked" ? "blocked" : "review"} /></td>
    </tr>
  );
}

function SkeletonRows(): ReactElement {
  return (
    <>
      {["one", "two", "three"].map((row) => (
        <tr key={row}>
          {["a", "b", "c", "d", "e"].map((cell) => (
            <td key={cell} className="border-b border-border px-3 py-3"><span className="block h-4 rounded-md bg-secondary" /></td>
          ))}
        </tr>
      ))}
    </>
  );
}

function MobileContactSkeleton(): ReactElement {
  return (
    <>
      {["one", "two", "three"].map((row) => (
        <div key={row} className="rounded-md border border-border bg-background p-3">
          <span className="block h-4 w-24 rounded-md bg-secondary" />
          <span className="mt-3 block h-4 w-full rounded-md bg-secondary" />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <span className="h-12 rounded-md bg-secondary" />
            <span className="h-12 rounded-md bg-secondary" />
          </div>
        </div>
      ))}
    </>
  );
}

function MobileContactCard({ contact }: Readonly<{ contact: Contact }>): ReactElement {
  return (
    <article className="rounded-md border border-border bg-background p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-medium text-foreground">{contact.label}</h3>
          <p className="mt-1 break-all font-mono text-xs leading-5 text-muted-foreground">{truncateAddress(contact.walletAddress)}</p>
        </div>
        <StatusBadge label={formatLabel(contact.status)} tone={contact.status === "active" ? "pass" : contact.status === "blocked" ? "blocked" : "review"} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-md border border-border bg-card px-2 py-2">
          <p className="text-muted-foreground">Role</p>
          <p className="mt-1 text-foreground">{formatLabel(contact.role)}</p>
        </div>
        <div className="rounded-md border border-border bg-card px-2 py-2">
          <p className="text-muted-foreground">Tokens</p>
          <p className="mt-1 font-mono text-foreground">{contact.allowedTokens.join(", ")}</p>
        </div>
      </div>
    </article>
  );
}

function ResolverMetric({ label, value, mono = false }: Readonly<{ label: string; value: string; mono?: boolean }>): ReactElement {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-1 truncate text-sm font-medium text-foreground", mono && "font-mono text-xs tabular-nums")}>{value}</p>
    </div>
  );
}

function TreasuryEducation(): ReactElement {
  return (
    <section className="rounded-md border border-accent/30 bg-accent/10 p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase text-accent">Treasury requirement</p>
          <h3 className="mt-2 text-base font-medium text-foreground">Use an existing Solana treasury address.</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            ShadeOps only stores the public treasury address for balance checks, policy review, and payout planning. It does not create wallets, custody funds, hold private keys, or treat your connected operator wallet as the treasury.
          </p>
        </div>
        <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3 lg:min-w-[24rem]">
          <TreasurySource label="Wallet" value="Phantom or Solflare" />
          <TreasurySource label="Multisig" value="Squads treasury" />
          <TreasurySource label="DAO" value="Realms treasury" />
        </div>
      </div>
    </section>
  );
}

function TreasurySource({ label, value }: Readonly<{ label: string; value: string }>): ReactElement {
  return (
    <div className="rounded-md border border-border/70 bg-background/70 px-3 py-2">
      <p className="font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 text-foreground">{value}</p>
    </div>
  );
}

function PolicyLane({ title, status, lines }: Readonly<{ title: string; status: string; lines: string[] }>): ReactElement {
  return (
    <section className="rounded-md border border-border bg-background p-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        <StatusBadge label={status} tone="info" />
      </div>
      <ul className="mt-3 space-y-2 text-xs leading-5 text-muted-foreground">
        {lines.map((line) => (
          <li key={line} className="flex gap-2"><CheckCircle2 aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />{line}</li>
        ))}
      </ul>
    </section>
  );
}

function ProofRow({ operation, recipient, route, status, hash }: Readonly<{ operation: string; recipient: string; route: string; status: string; hash: string }>): ReactElement {
  return (
    <div className="grid gap-3 rounded-md border border-border bg-background px-3 py-3 text-sm md:grid-cols-[1fr_0.8fr_0.5fr_0.7fr_0.7fr] md:items-center">
      <span className="font-medium text-foreground">{operation}</span>
      <span className="text-muted-foreground">{recipient}</span>
      <span className="font-mono text-xs text-muted-foreground">{route}</span>
      <span className="text-muted-foreground">{status}</span>
      <span className="font-mono text-xs text-muted-foreground">{hash}</span>
    </div>
  );
}

function StatusBadge({ label, tone, fixed = false }: Readonly<{ label: string; tone: "pass" | "review" | "blocked" | "info" | "nav"; fixed?: boolean }>): ReactElement {
  const toneClass = {
    pass: "border-primary/30 bg-primary/10 text-primary",
    review: "border-accent/40 bg-accent/10 text-accent",
    blocked: "border-destructive/40 bg-destructive/10 text-destructive",
    info: "border-border bg-secondary text-secondary-foreground",
    nav: "border-primary-foreground/35 bg-primary-foreground/12 text-primary-foreground"
  }[tone];

  return <span className={cn("inline-flex min-h-8 items-center justify-center rounded-md border px-2.5 text-xs font-semibold", fixed && "h-10 w-36", toneClass)}>{label}</span>;
}

function Alert({ message }: Readonly<{ message: string }>): ReactElement {
  return (
    <div className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-3 text-sm text-destructive">
      <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
      <p>{message}</p>
    </div>
  );
}

function resolveIntentPreview(intent: string, contacts: Contact[]): { status: "resolved" | "unresolved"; label: string; amount: string; token: string; walletAddress?: string; message: string } {
  const amountMatch = intent.match(/(\d+(?:\.\d+)?)\s*(USDC|USDT|SOL|BONK|USD)?/i);
  const recipientMatch = intent.match(/pay\s+([a-z0-9_.-]+)/i);
  const label = recipientMatch?.[1] ?? "Unresolved";
  const token = amountMatch?.[2]?.toUpperCase() === "USD" ? "USDC" : amountMatch?.[2]?.toUpperCase() ?? "USDC";
  const contact = contacts.find((item) => item.label.toLowerCase() === label.toLowerCase() || item.id === label.toLowerCase());

  if (contact?.status === "active" && contact.allowedTokens.includes(token)) {
    return { status: "resolved", label: contact.label, amount: amountMatch?.[1] ?? "0", token, walletAddress: contact.walletAddress, message: `Resolved from ${contact.source}. Admin still reviews before signing.` };
  }

  if (contact) {
    return { status: "unresolved", label: contact.label, amount: amountMatch?.[1] ?? "0", token, message: `${contact.label} exists, but contact status or token permissions require review.` };
  }

  return { status: "unresolved", label, amount: amountMatch?.[1] ?? "0", token, message: "No matching active contact. Add a recipient or include the wallet address in the intent." };
}

async function readApiError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { message?: string };
    return payload.message ?? "Request failed.";
  } catch {
    return "Request failed.";
  }
}

function workspaceHeaders(membership: WorkspaceMembership | null): Record<string, string> {
  return membership ? { [WORKSPACE_ID_HEADER]: membership.workspaceId } : {};
}

function truncateAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 4)}...${address.slice(-4)}` : address;
}

function formatLabel(value: string): string {
  return value.replace(/_/g, " ");
}
