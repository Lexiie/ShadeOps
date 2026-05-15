"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { AlertTriangle, Bot, CheckCircle2, ChevronDown, Clipboard, FileCheck2, Lightbulb, ListChecks, LockKeyhole, Search, Route, ShieldCheck, WalletCards, Wrench } from "lucide-react";
import Link from "next/link";
import type { ReactElement, ReactNode } from "react";
import { useEffect, useState } from "react";
import type { BalanceVerification, ParsedPayoutOperation, TreasuryContext } from "@/lib/schemas/payout";
import type { RecipientResolution } from "@/lib/schemas/contact";
import type { TreasuryConfig } from "@/lib/schemas/treasury";
import type { AgentAdvisory } from "@/lib/schemas/agent";
import type { PolicyResult } from "@/lib/schemas/policy";
import type { ExecutionPlan, ProofPackage } from "@/lib/schemas/proof";
import type { PrivacyRouteDecision } from "@/lib/schemas/route";
import { ShadeOpsLogo } from "@/components/ShadeOpsLogo";
import { cn } from "@/lib/utils";
import { executePrivacyPayout } from "@/lib/privacy/executePrivacyPayout";
import { claimUmbraReceivedPayouts, scanUmbraClaimablePayouts, type UmbraClaimScanResult } from "@/lib/privacy/umbraClient";

type PlanResponse = {
  parsedOperation: ParsedPayoutOperation;
  recipientResolution?: RecipientResolution;
  treasuryContext: TreasuryContext;
  balance: BalanceVerification;
  policyResult: PolicyResult;
  routeDecision: PrivacyRouteDecision;
  executionPlan: ExecutionPlan;
  agentAdvisory?: AgentAdvisory;
};

type WorkspaceMembership = {
  workspaceId: string;
  walletAddress: string;
  role: "owner" | "admin" | "reviewer";
};

const DEFAULT_INTENT = "Pay Alice 50 USDC privately for the bounty round.";
const WORKSPACE_ID_HEADER = "x-shadeops-workspace-id";

/**
 * Renders the complete private payout planning, approval, and proof package workflow.
 */
export function PayoutConsole({ initialTreasuryConfig = null }: Readonly<{ initialTreasuryConfig?: TreasuryConfig | null }>): ReactElement {
  const { connection } = useConnection();
  const { publicKey, signMessage, signTransaction, sendTransaction } = useWallet();
  const [intent, setIntent] = useState(DEFAULT_INTENT);
  const [treasuryWallet, setTreasuryWallet] = useState(initialTreasuryConfig?.walletAddress ?? "");
  const [treasuryConfig, setTreasuryConfig] = useState<TreasuryConfig | null>(initialTreasuryConfig);
  const [workspaceMembership, setWorkspaceMembership] = useState<WorkspaceMembership | null>(null);
  const [isLoadingTreasury, setIsLoadingTreasury] = useState(false);
  const [planResponse, setPlanResponse] = useState<PlanResponse | null>(null);
  const [proofPackage, setProofPackage] = useState<ProofPackage | null>(null);
  const [isPlanning, setIsPlanning] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isScanningUmbra, setIsScanningUmbra] = useState(false);
  const [isClaimingUmbra, setIsClaimingUmbra] = useState(false);
  const [umbraClaimScan, setUmbraClaimScan] = useState<UmbraClaimScanResult | null>(null);
  const [umbraClaimReferences, setUmbraClaimReferences] = useState<string[]>([]);
  const [umbraClaimError, setUmbraClaimError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadTreasuryConfig(): Promise<void> {
      setIsLoadingTreasury(true);

      try {
        const workspaceResponse = await fetch("/api/workspaces");

        if (!workspaceResponse.ok) {
          throw new Error(await readApiError(workspaceResponse));
        }

        const workspacePayload = (await workspaceResponse.json()) as { membership: WorkspaceMembership | null };

        if (!workspacePayload.membership) {
          throw new Error("Create a workspace in the dashboard before opening the payout console.");
        }

        const response = await fetch("/api/treasury/config", { headers: workspaceHeaders(workspacePayload.membership) });

        if (!response.ok) {
          throw new Error(await readApiError(response));
        }

        const payload = (await response.json()) as { treasuryConfig: TreasuryConfig | null };

        if (isMounted) {
          setWorkspaceMembership(workspacePayload.membership);
          setTreasuryConfig(payload.treasuryConfig);
          setTreasuryWallet(payload.treasuryConfig?.walletAddress ?? "");
        }
      } catch (caughtError) {
        if (isMounted) {
          setError(caughtError instanceof Error ? caughtError.message : "Unable to load treasury settings.");
        }
      } finally {
        if (isMounted) {
          setIsLoadingTreasury(false);
        }
      }
    }

    void loadTreasuryConfig();

    return () => {
      isMounted = false;
    };
  }, []);

  /**
   * Requests a deterministic payout plan from the server API.
   */
  async function handleCreatePlan(): Promise<void> {
    setIsPlanning(true);
    setError(null);
    setProofPackage(null);

    try {
      if (!treasuryWallet) {
        throw new Error("Configure a treasury wallet in the dashboard before creating a payout plan.");
      }

      if (!workspaceMembership) {
        throw new Error("Create or load a workspace before creating a payout plan.");
      }

      const response = await fetch("/api/payout/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...workspaceHeaders(workspaceMembership) },
        body: JSON.stringify({ rawText: intent, treasuryWallet })
      });

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      setPlanResponse((await response.json()) as PlanResponse);
      setUmbraClaimScan(null);
      setUmbraClaimReferences([]);
      setUmbraClaimError(null);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to create payout plan.");
    } finally {
      setIsPlanning(false);
    }
  }

  /**
   * Captures admin approval and asks the proof API to create an auditable package.
   */
  async function handleApprovePlan(): Promise<void> {
    if (!planResponse) {
      return;
    }

    setIsApproving(true);
    setError(null);

    try {
      const executionReferences = await executePrivacyPayout({
        plan: planResponse.executionPlan,
        connection,
        wallet: { publicKey, signMessage, signTransaction, sendTransaction }
      });
      const response = await fetch("/api/payout/proof", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...workspaceHeaders(workspaceMembership) },
        body: JSON.stringify({
          executionPlan: planResponse.executionPlan,
          adminApprovalTimestamp: new Date().toISOString(),
          executionReferences
        })
      });

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      const payload = (await response.json()) as { proofPackage: ProofPackage };
      setProofPackage(payload.proofPackage);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to approve plan.");
    } finally {
      setIsApproving(false);
    }
  }

  async function handleScanUmbraClaims(): Promise<void> {
    setIsScanningUmbra(true);
    setUmbraClaimError(null);

    try {
      setUmbraClaimScan(await scanUmbraClaimablePayouts({ publicKey, signMessage, signTransaction, sendTransaction }));
    } catch (caughtError) {
      setUmbraClaimError(caughtError instanceof Error ? caughtError.message : "Unable to scan Umbra claimable payouts.");
    } finally {
      setIsScanningUmbra(false);
    }
  }

  async function handleClaimUmbraPayouts(): Promise<void> {
    if (!planResponse) {
      return;
    }

    setIsClaimingUmbra(true);
    setUmbraClaimError(null);

    try {
      const claim = await claimUmbraReceivedPayouts({ publicKey, signMessage, signTransaction, sendTransaction }, planResponse.executionPlan.operationId);
      setUmbraClaimReferences(claim.references.map(formatExecutionReference));
      setUmbraClaimScan({ receivedCount: 0, publicReceivedCount: 0, nextScanStartIndex: umbraClaimScan?.nextScanStartIndex ?? 0 });
    } catch (caughtError) {
      setUmbraClaimError(caughtError instanceof Error ? caughtError.message : "Unable to claim Umbra payout.");
    } finally {
      setIsClaimingUmbra(false);
    }
  }

  /**
   * Copies the proof package JSON to the operator clipboard.
   */
  async function handleCopyProof(): Promise<void> {
    if (proofPackage) {
      await navigator.clipboard.writeText(JSON.stringify(proofPackage, null, 2));
    }
  }

  const isBlocked = planResponse?.policyResult.status === "blocked";

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,hsl(var(--muted))_0,transparent_36rem),hsl(var(--background))] px-4 pb-5 text-foreground sm:px-6 lg:px-8">
      <div className="sticky top-0 z-50 -mx-4 mb-5 border-b border-primary/30 bg-primary px-4 py-2 text-primary-foreground shadow-[0_12px_36px_rgba(0,0,0,0.22)] sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="mx-auto grid h-12 max-w-7xl grid-cols-[auto_1fr_auto] items-center gap-2 sm:gap-3">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <a className="inline-flex min-w-0 whitespace-nowrap focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-primary-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-primary" href="/" aria-label="ShadeOps home">
              <ShadeOpsLogo hideWordmarkOnSmall />
            </a>
          </div>

          <div className="mx-auto hidden h-10 w-full max-w-xl items-center gap-3 rounded-full bg-primary-foreground/92 px-4 text-sm text-background md:flex">
            <Search aria-hidden className="h-4 w-4 text-muted-foreground" />
            <span className="truncate text-muted-foreground">Operator console, policy checks, private execution</span>
          </div>

          <div className="flex min-w-0 items-center justify-end gap-2 sm:gap-3">
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
            <StatusPill tone="nav" label="Devnet" />
            <span className="hidden sm:block">
              <WalletMultiButton className="!h-10 !w-36 !min-w-36 !justify-center !rounded-md !bg-background !px-3 !text-xs !font-semibold !leading-none !text-foreground hover:!bg-background/92" />
            </span>
          </div>
        </div>
      </div>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <header className="flex flex-col gap-4 border-b border-border pb-5 pt-1">
          <div className="max-w-3xl">
            <h1 className="mt-2 text-3xl font-medium tracking-normal text-foreground sm:text-4xl">Private payout operator console</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Agent plans. Admin signs. Privacy protocol executes. Proof package records.
            </p>
          </div>
        </header>

        <section className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <Panel title="Payout intent" icon={<WalletCards aria-hidden className="h-4 w-4" />}>
            <div className="space-y-4">
              <label className="block text-sm font-medium" htmlFor="intent">Intent</label>
              <textarea
                id="intent"
                value={intent}
                onChange={(event) => setIntent(event.target.value)}
                className="min-h-36 w-full resize-y rounded-md border border-input bg-background px-3 py-3 text-sm leading-6 shadow-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
              <label className="block text-sm font-medium" htmlFor="treasury">Treasury wallet</label>
              <input
                id="treasury"
                value={treasuryWallet}
                onChange={(event) => setTreasuryWallet(event.target.value)}
                autoComplete="off"
                placeholder={isLoadingTreasury ? "Checking treasury settings..." : "Configure treasury in dashboard"}
                className="h-11 w-full rounded-md border border-input bg-background px-3 font-mono text-xs shadow-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:text-sm"
              />
              {treasuryConfig ? (
                <p className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-xs leading-5 text-primary">
                  Using {treasuryConfig.label} from dashboard settings on {treasuryConfig.network}.
                </p>
              ) : (
                <p className="rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-xs leading-5 text-accent">
                  Treasury is not configured. Open the dashboard, connect wallet, and save treasury settings before planning a real payout.
                </p>
              )}
              <button
                type="button"
                onClick={handleCreatePlan}
                disabled={isPlanning || !treasuryWallet}
                className="inline-flex min-h-10 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground ring-offset-background hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPlanning ? "Planning payout..." : "Create deterministic plan"}
              </button>
              <p className="rounded-md border border-border bg-muted px-3 py-2 text-xs leading-5 text-muted-foreground">
                No transaction is prepared until policy completes. No funds move without admin wallet approval and signature.
              </p>
            </div>
          </Panel>

          <div className="space-y-5">
            {error ? <Alert message={error} /> : null}
            {isPlanning ? <SkeletonPlan /> : null}
            <AgentActivityTimeline isPlanning={isPlanning} isApproving={isApproving} planResponse={planResponse} proofPackage={proofPackage} treasuryConfigured={Boolean(treasuryConfig)} />
            {planResponse ? <PlanReview planResponse={planResponse} /> : <EmptyPlan />}
          </div>
        </section>

        {planResponse ? (
          <section className="grid gap-5 lg:grid-cols-[1fr_0.85fr]">
            <AgentPlanPanel planResponse={planResponse} />

            <Panel title="Execution approval" icon={<ShieldCheck aria-hidden className="h-4 w-4" />}>
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Metric label="Recipient" value={planResponse.parsedOperation.recipientLabel} />
                  <Metric label="Amount" value={`${planResponse.parsedOperation.amount} ${planResponse.parsedOperation.tokenSymbol}`} />
                  <Metric label="Route" value={planResponse.routeDecision.mode.toUpperCase()} />
                </div>
                <ol className="space-y-2 text-sm text-muted-foreground">
                  {planResponse.executionPlan.steps.map((step) => (
                    <li key={step} className="flex gap-2 rounded-md border border-border bg-background px-3 py-2">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
                {planResponse.routeDecision.mode === "umbra" ? <UmbraClaimNotice /> : null}
                <button
                  type="button"
                  onClick={handleApprovePlan}
                  disabled={isBlocked || isApproving}
                  className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground ring-offset-background hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <LockKeyhole aria-hidden className="h-4 w-4" />
                  {isApproving ? "Recording approval..." : "Approve plan and create proof"}
                </button>
              </div>
            </Panel>

            <Panel title="Proof package" icon={<FileCheck2 aria-hidden className="h-4 w-4" />}>
              {proofPackage ? (
                <div className="space-y-3">
                  <Metric label="Operation" value={proofPackage.operationId} mono />
                  <Metric label="Decision hash" value={proofPackage.decisionHash} mono />
                  <Metric label="Approved" value={new Date(proofPackage.adminApprovalTimestamp).toLocaleString()} />
                  <button
                    type="button"
                    onClick={handleCopyProof}
                    className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md border border-border bg-secondary px-4 text-sm font-medium text-secondary-foreground ring-offset-background hover:bg-secondary/80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <Clipboard aria-hidden className="h-4 w-4" />
                    Copy proof JSON
                  </button>
                  {planResponse.routeDecision.mode === "umbra" ? <UmbraClaimNotice /> : null}
                </div>
              ) : (
                <p className="text-sm leading-6 text-muted-foreground">Proof appears after explicit admin approval. Blocked policy results cannot generate proof packages.</p>
              )}
            </Panel>
          </section>
        ) : null}

        {planResponse?.routeDecision.mode === "umbra" ? (
          <UmbraClaimPanel
            scan={umbraClaimScan}
            references={umbraClaimReferences}
            error={umbraClaimError}
            isScanning={isScanningUmbra}
            isClaiming={isClaimingUmbra}
            onScan={handleScanUmbraClaims}
            onClaim={handleClaimUmbraPayouts}
          />
        ) : null}
      </div>
    </main>
  );
}

/**
 * Formats a protocol SDK execution result into a stable proof reference string.
 */
function formatExecutionReference(reference: { protocol: string; label: string; signature: string }): string {
  return `${reference.protocol}:${reference.label}:${reference.signature}`;
}

function formatUsdMetric(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "--";
  }

  if (Object.is(value, -0) || value === 0) {
    return "$0.00";
  }

  return new Intl.NumberFormat("en-US", {
    compactDisplay: "short",
    currency: "USD",
    maximumFractionDigits: value >= 1000 ? 1 : 2,
    notation: value >= 1000 ? "compact" : "standard",
    style: "currency"
  }).format(value);
}

/**
 * Reads a normalized API error from a failed response.
 */
async function readApiError(response: Response): Promise<string> {
  const payload = (await response.json().catch(() => null)) as { message?: string } | null;
  return payload?.message ?? "Request failed.";
}

function workspaceHeaders(membership: WorkspaceMembership | null): Record<string, string> {
  return membership ? { [WORKSPACE_ID_HEADER]: membership.workspaceId } : {};
}

function AgentActivityTimeline({
  isPlanning,
  isApproving,
  planResponse,
  proofPackage,
  treasuryConfigured
}: Readonly<{
  isPlanning: boolean;
  isApproving: boolean;
  planResponse: PlanResponse | null;
  proofPackage: ProofPackage | null;
  treasuryConfigured: boolean;
}>): ReactElement {
  const steps = [
    { label: "Read intent", detail: "Waiting for an operator payout request.", state: "done" },
    { label: "Load treasury", detail: treasuryConfigured ? "Dashboard treasury is available." : "Treasury settings are required.", state: treasuryConfigured ? "done" : "waiting" },
    { label: "Parse and resolve", detail: planResponse ? "Recipient and amount were normalized." : "Agent has not built a plan yet.", state: planResponse ? "done" : isPlanning ? "active" : "waiting" },
    { label: "Policy decision", detail: planResponse ? formatPolicyStatus(planResponse.policyResult.status) : "Deterministic policy has not run.", state: planResponse ? statusToTimelineState(planResponse.policyResult.status) : "waiting" },
    { label: "Route selection", detail: planResponse ? `${planResponse.routeDecision.mode.toUpperCase()} selected by route rules.` : "Route is selected after policy context exists.", state: planResponse ? "done" : "waiting" },
    { label: "Admin signature", detail: isApproving ? "Wallet approval is in progress." : planResponse?.policyResult.status === "blocked" ? "Blocked plans cannot be signed." : planResponse ? "Ready for admin review." : "No plan is ready.", state: isApproving ? "active" : planResponse?.policyResult.status === "blocked" ? "blocked" : planResponse ? "active" : "waiting" },
    { label: "Proof record", detail: proofPackage ? "Execution references were recorded." : "Proof appears after real protocol execution.", state: proofPackage ? "done" : "waiting" }
  ] as const;

  return (
    <Panel title="Agent activity" icon={<Bot aria-hidden className="h-4 w-4" />}>
      <ol className="space-y-2">
        {steps.map((step) => (
          <li key={step.label} className="grid grid-cols-[auto_1fr] gap-3 rounded-md border border-border bg-background px-3 py-2">
            <span className={cn("mt-1.5 h-2.5 w-2.5 rounded-full", timelineDotClass(step.state))} aria-hidden />
            <span>
              <span className="block text-sm font-medium text-foreground">{step.label}</span>
              <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{step.detail}</span>
            </span>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

function AgentPlanPanel({ planResponse }: Readonly<{ planResponse: PlanResponse }>): ReactElement {
  const operation = planResponse.parsedOperation;
  const route = planResponse.routeDecision.mode.toUpperCase();
  const canExecute = planResponse.policyResult.status !== "blocked";

  return (
    <section className="fade-in rounded-lg border border-primary/30 bg-primary/10 p-4 text-card-foreground shadow-[0_16px_50px_rgba(0,0,0,0.18)] sm:p-5 lg:col-span-2">
      <div className="mb-4 flex items-center gap-2 border-b border-primary/25 pb-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-background text-primary"><ListChecks aria-hidden className="h-4 w-4" /></span>
        <h2 className="text-sm font-medium uppercase tracking-normal text-primary">Agent proposed plan</h2>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_0.95fr]">
        <div>
          <p className="text-sm leading-6 text-foreground">
            Prepare a private {operation.amount} {operation.tokenSymbol} payout to {operation.recipientLabel} using {route}. The agent has drafted the plan; policy remains the authority and admin wallet approval is still required.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <StatusPill tone={canExecute ? "pass" : "blocked"} label={canExecute ? "signable" : "blocked"} />
            <StatusPill tone="review" label="admin signs" />
            <StatusPill tone="pass" label="proof after execution" />
          </div>
        </div>
        <div className="rounded-md border border-primary/25 bg-background px-3 py-3">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Before funds move</p>
          <ul className="mt-2 space-y-2 text-sm leading-5 text-muted-foreground">
            {[
              "Recipient resolution and treasury context are visible for review.",
              "Policy result decides whether execution can continue.",
              "The connected admin wallet signs client-side only.",
              "Proof requires real Solana RPC-verifiable execution signatures."
            ].map((item) => (
              <li key={item} className="flex gap-2"><CheckCircle2 aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />{item}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/**
 * Renders a reusable console panel with a compact heading.
 */
function Panel({ title, icon, children }: Readonly<{ title: string; icon: ReactNode; children: ReactNode }>): ReactElement {
  return (
    <section className="fade-in rounded-lg border border-border bg-card p-4 text-card-foreground shadow-[0_16px_50px_rgba(0,0,0,0.18)] sm:p-5">
      <div className="mb-4 flex items-center gap-2 border-b border-border pb-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-secondary text-primary">{icon}</span>
        <h2 className="text-sm font-medium uppercase tracking-normal text-muted-foreground">{title}</h2>
      </div>
      {children}
    </section>
  );
}

/**
 * Renders a compact status pill with accessible text labels.
 */
function StatusPill({ label, tone, fixed = false }: Readonly<{ label: string; tone: "pass" | "review" | "blocked" | "nav"; fixed?: boolean }>): ReactElement {
  const toneClass = {
    pass: "border-primary/30 bg-primary/10 text-primary",
    review: "border-accent/40 bg-accent/10 text-accent",
    blocked: "border-destructive/40 bg-destructive/10 text-destructive",
    nav: "border-primary-foreground/35 bg-primary-foreground/12 text-primary-foreground"
  }[tone];

  return <span className={cn("inline-flex min-h-8 items-center justify-center rounded-md border px-2.5 text-xs font-semibold", fixed && "h-10 w-36", toneClass)}>{label}</span>;
}

function formatPolicyStatus(status: PolicyResult["status"]): string {
  if (status === "pass") {
    return "Policy passed. Execution can continue after admin review.";
  }

  if (status === "blocked") {
    return "Policy blocked this plan before signing.";
  }

  return "Policy requires manual review before signing.";
}

function statusToTimelineState(status: PolicyResult["status"]): "done" | "active" | "blocked" {
  if (status === "blocked") {
    return "blocked";
  }

  if (status === "needs_review") {
    return "active";
  }

  return "done";
}

function timelineDotClass(state: "done" | "active" | "blocked" | "waiting"): string {
  return {
    active: "bg-accent ring-4 ring-accent/15",
    blocked: "bg-destructive ring-4 ring-destructive/15",
    done: "bg-primary",
    waiting: "bg-muted-foreground/35"
  }[state];
}

/**
 * Renders an individual immutable operation metric.
 */
function Metric({ label, value, mono = false }: Readonly<{ label: string; value: string; mono?: boolean }>): ReactElement {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-1 break-all text-sm font-medium text-foreground", mono && "font-mono text-xs tabular-nums")}>{value}</p>
    </div>
  );
}

/**
 * Renders the complete operation, treasury, policy, and route review stack.
 */
function PlanReview({ planResponse }: Readonly<{ planResponse: PlanResponse }>): ReactElement {
  const policyTone = planResponse.policyResult.status === "pass" ? "pass" : planResponse.policyResult.status === "blocked" ? "blocked" : "review";

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      {planResponse.agentAdvisory ? <AgentAdvisoryPanel advisory={planResponse.agentAdvisory} /> : null}

      <Panel title="Parsed operation" icon={<CheckCircle2 aria-hidden className="h-4 w-4" />}>
        <div className="grid gap-3">
          <Metric label="Recipient" value={planResponse.parsedOperation.recipientLabel} />
          <Metric label="Wallet" value={planResponse.parsedOperation.recipientWallet ?? "Missing"} mono />
          {planResponse.recipientResolution ? <Metric label="Resolution" value={planResponse.recipientResolution.message} /> : null}
          <Metric label="Amount" value={`${planResponse.parsedOperation.amount} ${planResponse.parsedOperation.tokenSymbol}`} />
          <Metric label="Reason" value={planResponse.parsedOperation.reason} />
        </div>
      </Panel>

      <Panel title="Treasury check" icon={<WalletCards aria-hidden className="h-4 w-4" />}>
        <div className="space-y-3">
          <p className="text-sm leading-6 text-muted-foreground">{planResponse.treasuryContext.summary}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Metric label="Zerion source" value={planResponse.treasuryContext.source.replace("-", " ")} />
            <Metric label="Portfolio value" value={formatUsdMetric(planResponse.treasuryContext.portfolioValueUsd)} mono />
            <Metric label="Recent outflow" value={formatUsdMetric(planResponse.treasuryContext.recentOutflowUsd)} mono />
            <Metric label="Observed positions" value={String(planResponse.treasuryContext.holdings.length)} mono />
          </div>
          <Metric label="Spendable balance" value={`${planResponse.balance.spendableAmount} ${planResponse.balance.tokenSymbol}`} />
          <Metric label="Requested" value={`${planResponse.balance.requestedAmount} ${planResponse.balance.tokenSymbol}`} />
          {planResponse.treasuryContext.topPositions.length > 0 ? (
            <div className="rounded-md border border-border bg-background p-3">
              <p className="mb-2 text-xs text-muted-foreground">Top Zerion positions</p>
              <div className="space-y-2">
                {planResponse.treasuryContext.topPositions.map((position, index) => (
                  <div key={`${position.symbol}-${position.chain ?? "chain"}-${index}`} className="grid grid-cols-[1fr_auto] gap-3 text-sm">
                    <span className="truncate text-foreground">{position.symbol}{position.chain ? ` on ${position.chain}` : ""}</span>
                    <span className="font-mono tabular-nums text-muted-foreground">{formatUsdMetric(position.valueUsd)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </Panel>

      <Panel title="Policy result" icon={<AlertTriangle aria-hidden className="h-4 w-4" />}>
        <div className="space-y-3">
          <StatusPill tone={policyTone} label={planResponse.policyResult.status.replace("_", " ")} />
          <PolicyNarrative policyResult={planResponse.policyResult} />
          <div className="space-y-2">
            {planResponse.policyResult.ruleResults.map((rule) => (
              <div key={rule.ruleId} className="rounded-md border border-border bg-background px-3 py-2 text-sm">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{rule.ruleId}</span>
                  <StatusPill tone={rule.status === "pass" ? "pass" : rule.status === "blocked" ? "blocked" : "review"} label={rule.status.replace("_", " ")} />
                </div>
                <p className="text-muted-foreground">{rule.message}</p>
              </div>
            ))}
          </div>
          <FixActionList planResponse={planResponse} />
        </div>
      </Panel>

      <Panel title="Privacy route" icon={<Route aria-hidden className="h-4 w-4" />}>
        <div className="space-y-3">
          <RouteRecommendation planResponse={planResponse} />
          <Metric label="Recommended mode" value={planResponse.routeDecision.mode.toUpperCase()} />
          <Metric label="Reason code" value={planResponse.routeDecision.reasonCode} mono />
          <p className="text-sm leading-6 text-muted-foreground">{planResponse.routeDecision.explanation}</p>
          <div className="rounded-md border border-accent/30 bg-accent/10 px-3 py-2 text-xs leading-5 text-muted-foreground">
            <span className="font-semibold text-accent">Route support:</span> Cloak devnet is wired for SOL and devnet mock USDC shield-and-withdraw flows. Umbra supports receiver-claimable SPL token payouts.
          </div>
          {planResponse.routeDecision.mode === "umbra" ? <UmbraClaimNotice /> : null}
        </div>
      </Panel>
    </div>
  );
}

function PolicyNarrative({ policyResult }: Readonly<{ policyResult: PolicyResult }>): ReactElement {
  const failedRules = policyResult.ruleResults.filter((rule) => rule.status !== "pass");
  const passedRules = policyResult.ruleResults.filter((rule) => rule.status === "pass");

  if (policyResult.status === "pass") {
    return (
      <div className="rounded-md border border-primary/30 bg-primary/10 px-3 py-3 text-sm leading-6 text-muted-foreground">
        <p className="font-medium text-foreground">Policy passed because {passedRules.length} deterministic checks cleared.</p>
        <p className="mt-1">The agent can recommend execution, but the admin wallet still signs client-side.</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-accent/40 bg-accent/10 px-3 py-3 text-sm leading-6 text-muted-foreground">
      <p className="font-medium text-foreground">Policy needs attention before execution.</p>
      <ul className="mt-2 space-y-1">
        {failedRules.map((rule) => (
          <li key={rule.ruleId} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />{rule.message}</li>
        ))}
      </ul>
    </div>
  );
}

function RouteRecommendation({ planResponse }: Readonly<{ planResponse: PlanResponse }>): ReactElement {
  const route = planResponse.routeDecision.mode.toUpperCase();
  const fallback = planResponse.routeDecision.mode === "cloak" ? "Umbra if the recipient should claim privately later." : "Cloak when the payout can be direct shield-and-withdraw.";

  return (
    <div className="rounded-md border border-primary/30 bg-primary/10 px-3 py-3 text-sm leading-6 text-muted-foreground">
      <p className="font-medium text-foreground">Recommended route: {route}</p>
      <p className="mt-1">Reason: {planResponse.routeDecision.explanation}</p>
      <p className="mt-1">Fallback: {fallback}</p>
      {planResponse.routeDecision.tradeoffs.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {planResponse.routeDecision.tradeoffs.map((tradeoff) => (
            <li key={tradeoff} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />{tradeoff}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function FixActionList({ planResponse }: Readonly<{ planResponse: PlanResponse }>): ReactElement | null {
  const actions = buildFixActions(planResponse);

  if (actions.length === 0) {
    return null;
  }

  return (
    <div className="rounded-md border border-border bg-background px-3 py-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
        <Wrench aria-hidden className="h-4 w-4 text-primary" />
        Fix-this actions
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {actions.map((action) => (
          <Link key={action.href + action.label} href={action.href} className="inline-flex min-h-10 items-center justify-center rounded-md border border-border bg-secondary px-3 text-sm font-medium text-secondary-foreground hover:bg-secondary/80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
            {action.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

function buildFixActions(planResponse: PlanResponse): Array<{ label: string; href: string }> {
  const actions: Array<{ label: string; href: string }> = [];
  const ruleText = planResponse.policyResult.ruleResults.map((rule) => `${rule.ruleId} ${rule.message}`.toLowerCase()).join(" ");

  if (ruleText.includes("recipient") || !planResponse.parsedOperation.recipientWallet) {
    actions.push({ href: "/dashboard#contacts", label: "Review contacts" });
  }

  if (ruleText.includes("balance") || ruleText.includes("treasury")) {
    actions.push({ href: "/dashboard#treasury", label: "Open treasury settings" });
  }

  if (ruleText.includes("token")) {
    actions.push({ href: "/dashboard#contacts", label: "Check token permissions" });
  }

  if (planResponse.policyResult.status === "needs_review") {
    actions.push({ href: "/dashboard#policy", label: "Review policy lanes" });
  }

  return actions.filter((action, index, all) => all.findIndex((candidate) => candidate.label === action.label) === index);
}

function UmbraClaimPanel({
  scan,
  references,
  error,
  isScanning,
  isClaiming,
  onScan,
  onClaim
}: Readonly<{
  scan: UmbraClaimScanResult | null;
  references: string[];
  error: string | null;
  isScanning: boolean;
  isClaiming: boolean;
  onScan: () => void;
  onClaim: () => void;
}>): ReactElement {
  const claimableCount = (scan?.receivedCount ?? 0) + (scan?.publicReceivedCount ?? 0);

  return (
    <Panel title="Recipient claim" icon={<Search aria-hidden className="h-4 w-4" />}>
      <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="space-y-3">
          <p className="text-sm leading-6 text-muted-foreground">
            Recipients can scan Umbra mixer trees from this wallet, then claim received UTXOs into encrypted balance.
          </p>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <Metric label="Received" value={scan ? String(scan.receivedCount) : "Not scanned"} />
            <Metric label="Public received" value={scan ? String(scan.publicReceivedCount) : "Not scanned"} />
            <Metric label="Next scan index" value={scan ? String(scan.nextScanStartIndex) : "0"} mono />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={onScan}
              disabled={isScanning || isClaiming}
              aria-busy={isScanning}
              className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-md border border-border bg-secondary px-4 text-sm font-medium text-secondary-foreground ring-offset-background hover:bg-secondary/80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Search aria-hidden className="h-4 w-4" />
              {isScanning ? "Scanning..." : "Scan claimables"}
            </button>
            <button
              type="button"
              onClick={onClaim}
              disabled={isScanning || isClaiming || claimableCount === 0}
              aria-busy={isClaiming}
              className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground ring-offset-background hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <LockKeyhole aria-hidden className="h-4 w-4" />
              {isClaiming ? "Claiming..." : "Claim to encrypted balance"}
            </button>
          </div>
        </div>

        <div className="rounded-md border border-border bg-background p-3">
          {error ? <Alert message={error} /> : null}
          {!error && references.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Claim references</p>
              {references.map((reference) => (
                <p key={reference} className="break-all rounded-md border border-primary/25 bg-primary/10 px-3 py-2 font-mono text-xs leading-5 text-primary">
                  {reference}
                </p>
              ))}
            </div>
          ) : null}
          {!error && references.length === 0 && scan && claimableCount === 0 ? (
            <div className="flex min-h-32 flex-col justify-center rounded-md border border-border bg-muted px-3 py-4 text-sm leading-6 text-muted-foreground">
              <p className="font-medium text-foreground">No claimable payouts found</p>
              <p>Use the connected recipient wallet and scan again after the sender transaction is confirmed.</p>
            </div>
          ) : null}
          {!error && references.length === 0 && !scan ? (
            <div className="flex min-h-32 flex-col justify-center rounded-md border border-border bg-muted px-3 py-4 text-sm leading-6 text-muted-foreground">
              <p className="font-medium text-foreground">Ready to scan</p>
              <p>Connect the recipient wallet, then scan for received Umbra UTXOs.</p>
            </div>
          ) : null}
        </div>
      </div>
    </Panel>
  );
}

function UmbraClaimNotice(): ReactElement {
  return (
    <div className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-xs leading-5 text-muted-foreground">
      <span className="font-semibold text-primary">Umbra receiver-claimable:</span> this route creates a private claimable UTXO for the recipient. The recipient may need to claim with their wallet before funds appear in their public balance.
    </div>
  );
}

function AgentAdvisoryPanel({ advisory }: Readonly<{ advisory: AgentAdvisory }>): ReactElement {
  return (
    <section className="fade-in rounded-lg border border-primary/30 bg-primary/10 p-4 text-card-foreground shadow-[0_16px_50px_rgba(0,0,0,0.18)] sm:p-5 xl:col-span-2">
      <div className="mb-4 flex items-center gap-2 border-b border-primary/25 pb-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-background text-primary"><Lightbulb aria-hidden className="h-4 w-4" /></span>
        <h2 className="text-sm font-medium uppercase tracking-normal text-primary">Agent review</h2>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
        <div className="space-y-3">
          <p className="text-sm leading-6 text-foreground">{advisory.summary}</p>
          <div className="rounded-md border border-primary/25 bg-background px-3 py-3">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Next action</p>
            <p className="mt-1 text-sm leading-6 text-foreground">{advisory.nextAction}</p>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">{advisory.authorityBoundary}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <AdvisoryList title="Questions" items={advisory.questions} empty="No clarifying questions for this draft." />
          <AdvisoryList title="Suggestions" items={advisory.suggestions} empty="No additional suggestions." />
        </div>
      </div>
    </section>
  );
}

function AdvisoryList({ title, items, empty }: Readonly<{ title: string; items: string[]; empty: string }>): ReactElement {
  return (
    <div className="rounded-md border border-primary/25 bg-background px-3 py-3">
      <p className="text-xs font-semibold uppercase text-muted-foreground">{title}</p>
      {items.length > 0 ? (
        <ul className="mt-2 space-y-2 text-sm leading-5 text-muted-foreground">
          {items.map((item) => (
            <li key={item} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />{item}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm leading-5 text-muted-foreground">{empty}</p>
      )}
    </div>
  );
}

/**
 * Renders a calm empty state before a plan exists.
 */
function EmptyPlan(): ReactElement {
  return (
    <Panel title="Review queue" icon={<ShieldCheck aria-hidden className="h-4 w-4" />}>
      <div className="flex min-h-64 flex-col justify-center rounded-md border border-dashed border-border bg-background px-5 py-8 text-center">
        <p className="text-sm font-medium text-foreground">No payout plan yet</p>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">Create a deterministic plan to inspect parser output, treasury context, policy status, route selection, and required admin signature steps.</p>
      </div>
    </Panel>
  );
}

/**
 * Renders loading skeletons that preserve review layout while planning is in progress.
 */
function SkeletonPlan(): ReactElement {
  return (
    <Panel title="Planning" icon={<ShieldCheck aria-hidden className="h-4 w-4" />}>
      <div className="space-y-3">
        <div className="h-10 animate-pulse rounded-md bg-muted" />
        <div className="h-24 animate-pulse rounded-md bg-muted" />
        <div className="h-16 animate-pulse rounded-md bg-muted" />
      </div>
    </Panel>
  );
}

/**
 * Renders recoverable API or workflow errors.
 */
function Alert({ message }: Readonly<{ message: string }>): ReactElement {
  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      <p className="font-medium">Action needed</p>
      <p className="mt-1 text-destructive/90">{message}</p>
    </div>
  );
}
