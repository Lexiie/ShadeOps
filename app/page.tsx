import { ArrowRight, BookUser, FileCheck2, Menu, Search, ShieldCheck, UserCircle2, WalletCards } from "lucide-react";
import Link from "next/link";
import type { ReactElement, ReactNode } from "react";
import { ShadeOpsLogo } from "@/components/ShadeOpsLogo";
import { cn } from "@/lib/utils";

const useCases = [
  "Bounty rounds",
  "Vendor ops",
  "DAO grants",
  "Contributor payroll"
];

const workflowSteps = [
  { label: "Intent", detail: "Natural language payout request", kind: "input" },
  { label: "Resolve", detail: "Workspace contact lookup", kind: "data" },
  { label: "Verify", detail: "Treasury and balance check", kind: "check" },
  { label: "Policy", detail: "Pass, review, or blocked", kind: "check" },
  { label: "Route", detail: "Umbra or Cloak recommendation", kind: "route" },
  { label: "Sign", detail: "Admin wallet approval", kind: "control" },
  { label: "Proof", detail: "Decision hash and references", kind: "record" }
];

const controlPoints = [
  { icon: <BookUser aria-hidden className="h-4 w-4" />, title: "Contacts decide recipients", body: "Named recipients resolve only from workspace address book entries or explicit wallet input." },
  { icon: <WalletCards aria-hidden className="h-4 w-4" />, title: "Treasury is configured", body: "Connected wallets sign approvals. They are never silently treated as treasury wallets." },
  { icon: <ShieldCheck aria-hidden className="h-4 w-4" />, title: "Policy outranks the agent", body: "Deterministic rules decide whether preparation can continue before any route is offered." },
  { icon: <FileCheck2 aria-hidden className="h-4 w-4" />, title: "Proof follows execution", body: "Proof packages require real protocol execution references and preserve the decision hash." }
];

const faqs = [
  {
    question: "Do I need an existing treasury wallet?",
    answer: "Yes. ShadeOps uses an existing Solana wallet, multisig, DAO treasury, or program treasury public address. It does not create or custody treasury wallets."
  },
  {
    question: "How do I create a treasury wallet?",
    answer: "Create one with a Solana wallet app for simple teams, use Squads for multisig control, or use Realms for DAO treasury governance. After it exists, paste the public treasury address into the dashboard."
  },
  {
    question: "Does ShadeOps ever hold private keys?",
    answer: "No. Wallet signing stays client-side through the connected admin wallet. The server stores configuration and proof data, not private keys."
  },
  {
    question: "Which tokens are supported?",
    answer: "ShadeOps supports SOL, USDC, and USDT payout planning. Cloak devnet is wired for SOL and devnet mock USDC shield-and-withdraw flows. Umbra creates receiver-claimable SPL token payouts, so recipients may need to claim with their wallet."
  },
  {
    question: "Are there fees?",
    answer: "Yes. Solana network fees apply to protocol transactions. Cloak can include protocol or relay fees, while Umbra receiver-claimable payouts may require the recipient to pay a claim transaction fee unless sponsorship is added. ShadeOps does not add a platform fee."
  },
  {
    question: "What does the agent actually control?",
    answer: "The agent drafts and explains. Deterministic code resolves recipients, checks treasury balance, applies policy, selects a route, and blocks unsafe plans before signing."
  },
  {
    question: "When is a proof package created?",
    answer: "Only after execution references are supplied from the browser-side protocol path. Blocked plans and fake references cannot create proof packages."
  }
];

/**
 * Renders the ShadeOps product-led landing page.
 */
export default function HomePage(): ReactElement {
  return (
    <main id="top" className="min-h-screen bg-background text-foreground">
      <LandingHeader />
      <section className="relative overflow-hidden border-b border-border bg-background">
        <div className="relative mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-7xl items-center gap-8 px-4 pb-10 pt-8 sm:px-6 lg:grid-cols-[0.74fr_1.26fr] lg:px-8">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-normal text-primary">Private payout operations for Solana teams</p>
            <h1 className="mt-4 font-hero text-5xl font-normal leading-none tracking-normal text-foreground sm:text-6xl lg:text-7xl">
              Agent-assisted payouts with human signing authority.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground">
              ShadeOps turns a payout request into an operator-ready draft: recipient resolved, treasury checked, policy explained, route recommended, and proof recorded only after admin approval.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/dashboard"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground ring-offset-background hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                Open workspace dashboard
                <ArrowRight aria-hidden className="h-4 w-4" />
              </Link>
              <Link
                href="/payout"
                className="inline-flex min-h-11 items-center justify-center rounded-md border border-border bg-secondary px-5 text-sm font-medium text-secondary-foreground ring-offset-background hover:bg-secondary/80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                Review payout console
              </Link>
            </div>
            <dl className="mt-8 grid grid-cols-3 gap-2 sm:gap-3">
              <Stat label="Agent" value="Draft" />
              <Stat label="Authority" value="Policy" />
              <Stat label="Signer" value="Admin" />
            </dl>
          </div>
          <HeroConsole />
        </div>
      </section>

      <section className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <p className="max-w-xl text-sm leading-6 text-muted-foreground">Built for teams that pay real contributors while keeping operational relationships private and reviewable.</p>
          <div className="flex flex-wrap gap-2">
            {useCases.map((useCase) => (
              <span key={useCase} className="inline-flex min-h-10 items-center rounded-full border border-border bg-background px-3 text-sm text-foreground">
                {useCase}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section id="use-cases" className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[0.82fr_1.18fr] lg:px-8">
        <div className="max-w-xl">
          <p className="text-xs font-semibold uppercase tracking-normal text-primary">Why it exists</p>
          <h2 className="mt-3 text-3xl font-medium tracking-normal text-foreground">Public payouts expose the operating graph.</h2>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            Transparent transfers can reveal who works with the team, how often they are paid, which vendors matter, and when treasury cadence changes. ShadeOps keeps payout preparation inspectable without broadcasting every relationship.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <CompactMetric label="Visible relationships" value="7 links" tone="warn" />
            <CompactMetric label="Private proof state" value="recorded" tone="pass" />
          </div>
        </div>
        <VisualImage src="/shadeops-exposure-graph.png" width={1200} height={760} alt="Treasury graph showing public payout relationships to contributors, vendors, and grantees." />
      </section>

      <section id="architecture" className="border-y border-border bg-background">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-normal text-primary">Controlled agentic workflow</p>
              <h2 className="mt-3 text-3xl font-medium tracking-normal text-foreground">A payout pipeline with checkpoints.</h2>
            </div>
            <p className="max-w-md text-sm leading-6 text-muted-foreground">The agent can parse and explain. Deterministic code resolves data, checks policy, prepares execution, and blocks unsafe plans before signing.</p>
          </div>
          <VisualImage src="/shadeops-workflow-pipeline.png" width={1400} height={520} alt="ShadeOps payout workflow from intent through proof, with deterministic checkpoints before admin signing." />
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[1.08fr_0.92fr] lg:px-8">
        <VisualImage src="/shadeops-control-plane.png" width={1200} height={760} alt="ShadeOps control plane showing workspace data, policy engine, privacy route, admin signer, and proof boundary." />
        <div className="flex flex-col justify-center">
          <p className="text-xs font-semibold uppercase tracking-normal text-primary">Security boundary</p>
          <h2 className="mt-3 text-3xl font-medium tracking-normal text-foreground">The agent is present, but boxed in.</h2>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            ShadeOps is intentionally boring where money moves. It cannot invent wallets, cannot sign, cannot fake execution references, and cannot override policy results.
          </p>
          <div className="mt-6 grid gap-3">
            {controlPoints.map((point) => (
              <ControlPoint key={point.title} icon={point.icon} title={point.title} body={point.body} />
            ))}
          </div>
        </div>
      </section>

      <FAQSection />

      <LandingFooter />
    </main>
  );
}

/**
 * Renders the landing page top navigation.
 */
function LandingHeader(): ReactElement {
  return (
    <header className="sticky top-0 z-50 border-b border-primary/30 bg-primary text-primary-foreground">
      <div className="mx-auto grid h-16 max-w-7xl grid-cols-[auto_1fr_auto] items-center gap-3 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <details className="relative">
            <summary aria-label="Open navigation" className="inline-flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-md text-primary-foreground ring-offset-primary hover:bg-primary-foreground/12 focus-visible:ring-2 focus-visible:ring-primary-foreground focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
              <Menu aria-hidden className="h-5 w-5" />
            </summary>
            <div className="absolute left-0 top-12 w-44 rounded-md border border-border bg-card p-1 text-foreground">
              <a href="#use-cases" className="flex min-h-10 items-center rounded-md px-3 text-sm hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">Use cases</a>
              <a href="#architecture" className="flex min-h-10 items-center rounded-md px-3 text-sm hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">Workflow</a>
              <Link href="/dashboard" className="flex min-h-10 items-center rounded-md px-3 text-sm hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">Dashboard</Link>
              <Link href="/payout" className="flex min-h-10 items-center rounded-md px-3 text-sm hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">Payout</Link>
            </div>
          </details>
          <Link href="/" className="inline-flex min-w-0 whitespace-nowrap focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-primary-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-primary" aria-label="ShadeOps home">
            <ShadeOpsLogo />
          </Link>
        </div>

        <a href="#architecture" className="mx-auto hidden h-11 w-full max-w-2xl items-center gap-3 rounded-full border border-primary-foreground/30 bg-primary-foreground/92 px-4 text-sm text-background hover:bg-primary-foreground focus-visible:ring-2 focus-visible:ring-primary-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-primary md:flex">
          <Search aria-hidden className="h-4 w-4 text-muted-foreground" />
          <span className="truncate text-muted-foreground">Intent, policy, route, approval, proof</span>
        </a>

        <nav className="flex items-center justify-end gap-2" aria-label="Primary navigation">
          <a className="hidden min-h-10 items-center rounded-md px-3 text-sm hover:bg-primary-foreground/12 focus-visible:ring-2 focus-visible:ring-primary-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-primary sm:inline-flex" href="#use-cases">Use cases</a>
          <a className="hidden min-h-10 items-center rounded-md px-3 text-sm hover:bg-primary-foreground/12 focus-visible:ring-2 focus-visible:ring-primary-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-primary lg:inline-flex" href="#architecture">Workflow</a>
          <Link className="hidden min-h-10 items-center rounded-md px-3 text-sm hover:bg-primary-foreground/12 focus-visible:ring-2 focus-visible:ring-primary-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-primary sm:inline-flex" href="/dashboard">Dashboard</Link>
          <Link className="inline-flex min-h-10 items-center rounded-md bg-background px-4 text-sm font-medium text-foreground hover:bg-background/92 focus-visible:ring-2 focus-visible:ring-primary-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-primary" href="/payout">Payout</Link>
          <span className="hidden h-10 w-10 items-center justify-center rounded-md border border-primary-foreground/25 xl:inline-flex" aria-hidden><UserCircle2 className="h-5 w-5" /></span>
        </nav>
      </div>
    </header>
  );
}

function Stat({ label, value }: Readonly<{ label: string; value: string }>): ReactElement {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-base font-medium text-foreground">{value}</dd>
    </div>
  );
}

function HeroConsole(): ReactElement {
  return (
    <figure className="relative">
      <img
        src="/shadeops-hero-mock.png"
        alt="ShadeOps payout review console showing intent, recipient resolution, policy status, route recommendation, signing step, and proof receipt."
        width={1400}
        height={920}
        className="h-auto w-full rounded-lg border border-border"
      />
    </figure>
  );
}

function VisualImage({ src, alt, width, height }: Readonly<{ src: string; alt: string; width: number; height: number }>): ReactElement {
  return (
    <figure className="mt-7">
      <img src={src} alt={alt} width={width} height={height} className="h-auto w-full rounded-lg border border-border" />
    </figure>
  );
}

function CompactMetric({ label, value, tone }: Readonly<{ label: string; value: string; tone: "warn" | "pass" }>): ReactElement {
  return (
    <div className="border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-2 text-xl font-medium", tone === "warn" ? "text-accent" : "text-primary")}>{value}</p>
    </div>
  );
}

function ControlPoint({ icon, title, body }: Readonly<{ icon: ReactNode; title: string; body: string }>): ReactElement {
  return (
    <div className="flex gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm leading-6">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-secondary text-primary">{icon}</span>
      <span>
        <span className="block font-medium text-foreground">{title}</span>
        <span className="mt-1 block text-muted-foreground">{body}</span>
      </span>
    </div>
  );
}

function FAQSection(): ReactElement {
  return (
    <section className="border-t border-border bg-background">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[0.72fr_1.28fr] lg:px-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-normal text-primary">FAQ</p>
          <h2 className="mt-3 text-3xl font-medium tracking-normal text-foreground">Operational questions, answered plainly.</h2>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            ShadeOps is designed around explicit treasury ownership, wallet signing, and auditable private payout preparation.
          </p>
        </div>
        <div className="divide-y divide-border rounded-lg border border-border bg-background">
          {faqs.map((faq) => (
            <details key={faq.question} className="group p-4 open:bg-card/60">
              <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium text-foreground focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
                {faq.question}
                <span className="text-lg leading-none text-primary transition-transform group-open:rotate-45" aria-hidden>+</span>
              </summary>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{faq.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function LandingFooter(): ReactElement {
  return (
    <footer className="border-t border-border bg-card/35 px-4 py-8 text-sm text-muted-foreground sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div>
          <Link href="/" className="text-sm font-semibold uppercase tracking-normal text-primary focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">ShadeOps Agent</Link>
          <p className="mt-2 max-w-xl leading-6">Agent-assisted private payout operations for Solana teams. Drafted by the agent, checked by policy, signed by admins.</p>
        </div>
        <nav className="flex flex-wrap items-center gap-2" aria-label="Footer navigation">
          <a className="inline-flex min-h-10 items-center rounded-md border border-border bg-background px-3 text-foreground hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" href="#use-cases">Use cases</a>
          <a className="inline-flex min-h-10 items-center rounded-md border border-border bg-background px-3 text-foreground hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" href="#architecture">Workflow</a>
          <Link className="inline-flex min-h-10 items-center rounded-md border border-border bg-background px-3 text-foreground hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" href="/dashboard">Dashboard</Link>
          <Link className="inline-flex min-h-10 items-center rounded-md border border-border bg-background px-3 text-foreground hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" href="/payout">Payout</Link>
        </nav>
      </div>
      <div className="mx-auto mt-6 flex max-w-7xl flex-col gap-3 border-t border-border pt-4 text-xs md:flex-row md:items-center md:justify-between">
        <p className="truncate">Copyright 2026 ShadeOps Agent. Built for bounded private payout review.</p>
        <a className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background text-foreground hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" href="#top" aria-label="Back to top">↑</a>
      </div>
    </footer>
  );
}
