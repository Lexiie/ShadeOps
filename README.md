# ShadeOps Agent

[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org/)
[![Solana](https://img.shields.io/badge/Solana-private%20payouts-14F195)](https://solana.com/)
[![Umbra](https://img.shields.io/badge/Umbra-receiver--claimable-7C3AED)](https://umbraprivacy.com/)
[![Cloak](https://img.shields.io/badge/Cloak-private%20SOL-111827)](https://cloak.dev/)
[![Policy](https://img.shields.io/badge/Policy-admin%20signed-F59E0B)](#agent-boundaries)

ShadeOps Agent is an agent-assisted private payout operator for Solana teams. It turns a payout intent such as "Pay Alice 50 USDC privately for the bounty round" into a reviewable draft: recipient resolved from workspace contacts, treasury checked, policy explained, route recommended, and proof recorded after admin approval.

The agent helps with interpretation, clarifying questions, advisory review, and explanation. It does not approve payments, invent wallet addresses, bypass policy, sign transactions, or move funds.

![ShadeOps payout review console](assets/readme/hero.svg)

## One-Liner

Agent-assisted private payout ops for Solana teams, with deterministic policy checks and admin-controlled signing.

## Problem

Solana teams frequently pay bounty winners, contributors, vendors, grant recipients, contractors, and operators from shared treasuries. Standard public transfers reveal sensitive operational information: recipient relationships, payout amounts, timing, treasury cadence, and runway signals.

Private payments reduce that exposure, but they add operational risk. Admins need to know whether the treasury has enough balance, whether the recipient and amount fit team policy, which privacy route should be used, and what proof can be retained after execution.

ShadeOps is designed for the operational middle ground that most teams actually need: an agent can help parse intent and prepare a draft, but financial authority remains with deterministic policy and an admin wallet. That is intentional. A fully autonomous payout bot would be faster, but it would also be harder to audit, easier to misconfigure, and riskier for shared treasuries.

## Solution

ShadeOps Agent converts human payout intent into a structured payout draft, resolves named recipients from the workspace address book, loads the configured treasury, observes treasury context with Zerion API or CLI, verifies exact spendable balance with Solana RPC, evaluates deterministic TypeScript policy, recommends Umbra or Cloak, prepares an execution plan, requires admin approval/signature, and generates a proof package after execution.

The product is built around a review-first control plane:

- **Agent assists:** parse payout text, summarize risk, and explain next actions.
- **Workspace data resolves:** contacts and treasury settings are scoped to the signed wallet's workspace.
- **Policy decides:** deterministic TypeScript checks pass, require review, or block the plan.
- **Admin signs:** the connected wallet signs protocol transactions client-side.
- **Privacy executes:** Umbra or Cloak handles the private payment path.
- **Proof records:** the server stores a decision hash and verifies execution signatures before recording proof.

## What ShadeOps Owns

ShadeOps is an operations layer, not a thin protocol wrapper. Umbra and Cloak provide private execution adapters; Zerion provides treasury context; Supabase provides server-side persistence. ShadeOps owns the payout workflow around those systems:

- workspace-scoped wallet sessions, roles, and membership;
- recipient address book and deterministic name-to-wallet resolution;
- treasury configuration that separates operator signers from treasury addresses;
- deterministic policy gates for allowed tokens, amount thresholds, balance sufficiency, recipient resolution, and treasury outflow review;
- route selection between private payment adapters;
- admin approval and client-side wallet signing boundaries;
- proof package hashing, RPC signature verification, admin signer binding, decoded transaction hints, and workspace audit records.

The value is the controlled payout process before and after private execution, not simply a call to a privacy SDK.

Core flow:

![ShadeOps private payout workflow](assets/readme/workflow.svg)

```text
Payout intent
-> Agent parser or deterministic fallback
-> Address book recipient resolution
-> Dashboard treasury configuration
-> Zerion API or CLI treasury context
-> Solana RPC balance verification
-> Deterministic policy evaluation
-> Bounded agent review
-> Umbra or Cloak route recommendation
-> Execution plan
-> Admin approval and wallet signature
-> Private payment execution
-> Proof package
```

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Solana Wallet Adapter
- `@solana/web3.js`
- Vercel AI SDK
- Optional AI provider through Vercel AI SDK for agent parsing
- Zod
- Zerion API or CLI
- `@umbra-privacy/sdk`
- `@umbra-privacy/web-zk-prover`
- `@cloak.dev/sdk-devnet`
- Prisma
- Supabase REST/PostgREST API

## Product Surfaces

- `/` explains who ShadeOps is for and why public payout graphs are operationally sensitive.
- `/dashboard` is wallet-gated. After signing, a new wallet can create its first workspace in-app, then configure contacts, treasury settings, resolver preview, policy lanes, and proof log.
- `/payout` is the payout planning console. It reads treasury settings from the dashboard and refuses to plan when treasury is missing.
- `/api/workspaces` returns the signed wallet's primary workspace or creates the first workspace with that wallet as owner.
- `/api/contacts` provides the workspace-scoped address book used for recipient resolution.
- `/api/treasury/config` provides the workspace-scoped treasury configuration used by payout planning.
- `/api/payout/proof` records verified proof packages and exposes the workspace proof log.

## Hackathon Track Fit

ShadeOps is a fit for the privacy payment tracks because it turns protocol SDKs into a concrete operator workflow. Teams can prepare, review, sign, execute, and record private payouts without pretending the AI is the financial authority.

### Cloak Track: Real-World Private Payments

The Cloak track asks builders to create real-world payment solutions with privacy. ShadeOps applies Cloak to a familiar treasury use case: private SOL and devnet mock USDC payouts to vendors or operators where the team wants an audit-friendly admin flow without publishing a direct treasury-to-recipient payment graph.

How the Cloak adapter fits into ShadeOps:

- The route selector recommends Cloak for vendor-style payout flows and native SOL private payouts.
- `lib/privacy/cloakClient.ts` uses `@cloak.dev/sdk-devnet` functional UTXO APIs, not the removed legacy `generateNote`/`send` path.
- The current devnet adapter is wired for native SOL and Cloak devnet mock USDC: it shields the selected asset into a UTXO and withdraws to the resolved recipient.
- The browser wallet signs client-side; ShadeOps never holds treasury private keys.
- The proof route verifies the reported Cloak signatures through Solana RPC, checks the approving admin signer, rejects duplicate signatures, binds the reference to the operation id, and checks the decoded withdrawal transaction references the approved recipient when that value is visible.

Why this design matters for Cloak:

- Cloak provides private payment execution; ShadeOps provides the workspace, policy, approval, and proof controls around it.
- Teams still get human approval, treasury checks, policy review, and proof records.
- The app avoids implying autonomous fund movement, which is important for real treasuries.

### Umbra Side Track: Receiver-Claimable SPL Payouts

The Umbra side track rewards projects that build with Umbra. ShadeOps uses Umbra for receiver-claimable SPL token payouts, especially USDC-style contributor, bounty, and grant payments where the recipient may need to claim privately with their wallet.

How the Umbra adapter fits into ShadeOps:

- The route selector recommends Umbra for bounty/contributor-style SPL payout flows.
- `lib/privacy/umbraClient.ts` uses `@umbra-privacy/sdk` and `@umbra-privacy/web-zk-prover` to create receiver-claimable UTXOs from public SPL balance.
- The recipient path supports scanning claimable Umbra payouts and claiming received claimables into encrypted balance through the configured indexer, relayer, and prover.
- The payout console exposes scan and claim actions for recipient-side Umbra flows.
- The proof route verifies Umbra execution signatures through Solana RPC, checks the approving admin signer, binds references to the approved operation, rejects duplicate signatures, and checks decoded transaction hints for the approved token mint when visible.

Why this design matters for Umbra:

- Receiver-claimable payouts fit real contributor operations: the sender can create the private claimable object, and the recipient can complete the claim flow with their own wallet.
- ShadeOps makes the claim requirement explicit in UI copy so operators do not mistake a claimable payout for an immediately visible public wallet balance.
- The product keeps protocol privacy while still preserving a reviewable operation record before and after execution.

### Supporting Zerion Integration

Zerion is not the core privacy execution layer in ShadeOps. It is used as treasury context infrastructure: the server can fetch portfolio, wallet positions, and recent transaction context through the Zerion API or a configured CLI command. That context feeds operator review and recent-outflow policy signals, while Solana RPC remains the source of truth for exact SOL/SPL balance checks and proof signature verification.

## Agent Boundaries

- The LLM may parse payout intent, ask clarifying questions, summarize risk, and explain decisions.
- The LLM may not approve payments.
- The LLM may not invent or silently resolve wallet addresses.
- The LLM may not bypass deterministic policy.
- The LLM may not sign transactions.
- The LLM may not move funds.
- Recipient resolution, treasury selection, policy evaluation, route selection, and execution planning are deterministic TypeScript modules.
- Every transaction requires admin wallet approval/signature.

Connected wallets are admin/operator signers. They are not automatically treated as treasury wallets. Treasury wallets must be configured in the dashboard.

## Treasury Setup

ShadeOps expects an existing Solana treasury public address. The treasury can be a standard wallet, a Squads multisig, a Realms DAO treasury, or a program-controlled treasury. ShadeOps stores the public address for balance checks and planning; it does not create wallets, custody funds, hold private keys, or treat the connected operator wallet as the treasury.

If a team does not have a treasury yet, create one in the wallet/multisig/DAO tool first, then paste the public address into the dashboard treasury settings.

## Route And Token Support

- ShadeOps supports SOL, USDC, and USDT payout planning.
- Cloak devnet is wired in ShadeOps for private SOL and devnet mock USDC shield-and-withdraw flows.
- Umbra is used for receiver-claimable SPL token payouts; recipients may need to claim with their wallet before funds appear in their public balance.
- USDC and USDT use their Solana SPL token mints and require the treasury wallet to hold the corresponding associated token account balance.

## Proof Model

Proof packages are only created after the browser reports real protocol execution signatures. The server no longer creates demo references. Before proof is stored, ShadeOps verifies:

- the plan is not blocked by policy;
- references match the approved operation id and selected route;
- duplicate signatures are rejected;
- signatures exist on Solana RPC, are confirmed or finalized, and did not fail;
- signatures were signed by the approving admin wallet;
- visible decoded hints match the approved plan, such as Umbra token mints and Cloak withdrawal recipients.

Privacy protocols may hide some semantic details by design, so ShadeOps records the strongest public verification available without weakening the privacy model.

## Fees

Solana network fees apply to protocol transactions. Cloak can include protocol or relay fees. Umbra receiver-claimable payouts may require the recipient to pay a claim transaction fee unless fee sponsorship is added. ShadeOps does not add a platform fee.

## Required Runtime Configuration

ShadeOps now fails closed instead of inventing demo treasury or execution references.

Start from `.env.example` for the complete local/Vercel environment shape.

Core server configuration:

```bash
SUPABASE_URL="https://your-project-ref.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="replace-with-supabase-service-role-key"
SHADEOPS_SESSION_SECRET="replace-with-a-long-random-secret"
SOLANA_RPC_URL="https://api.devnet.solana.com"
ZERION_API_KEY="your_zerion_api_key"
```

ShadeOps uses Supabase through its server-side REST/PostgREST API, not the browser client and not a public anon key. `SUPABASE_SERVICE_ROLE_KEY` must only be set on the server and must never use the `NEXT_PUBLIC_` prefix. The API is used for workspace membership, contacts, treasury config, payout audit records, and proof records. `SHADEOPS_SESSION_SECRET` signs wallet-session cookies and must be unique per deployment. `SOLANA_RPC_URL` is used for exact SOL/SPL balance checks and proof signature verification. `ZERION_API_KEY` is the preferred hosted treasury observer path for portfolio, position, and recent transaction context.

Optional Prisma/Postgres variables can still be used for schema generation or migration jobs:

```bash
DATABASE_URL="postgresql://USER:PASSWORD@HOST:6543/postgres?pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://USER:PASSWORD@HOST:5432/postgres?sslmode=require"
```

A configured Zerion CLI can be used for local development instead of the API:

```bash
ZERION_CLI_PATH="zerion"
ZERION_CLI_ARGS="wallet {wallet} --json"
```

Agent structured parsing uses the Vercel AI SDK and is backed by Gemini when this key is present:

```bash
GOOGLE_GENERATIVE_AI_API_KEY="your_gemini_api_key"
```

Without the provider key, the app falls back to the local deterministic parser so demos and tests still run.

After wallet sign-in, the dashboard creates the first workspace in-app and assigns the signing wallet as owner. `SHADEOPS_WORKSPACE_MEMBERS` is best treated as bootstrap/runtime fallback, not the primary hosted-product path.

The Prisma schema remains as the table contract for contacts, treasury config, payout operations, proof records, and wallet session audit. Runtime persistence prefers Supabase API credentials when configured, can use Prisma when `DATABASE_URL` and a generated Prisma client are available, and falls back to runtime stores only for local demo/test use. In `NODE_ENV=production`, either Supabase API credentials or a working Prisma/Postgres path must be present. In this Ubuntu/aarch64 environment, installing the Prisma CLI crashed with `double free or corruption`, so Prisma migrations/client generation still need to be run in a stable environment if that path is used.

With `ZERION_API_KEY`, the treasury observer calls Zerion wallet portfolio, simple wallet positions, and recent transactions endpoints. ShadeOps uses that context for operator review and recent-outflow policy signals.

Browser-side Umbra execution requires public SDK configuration:

```bash
NEXT_PUBLIC_SOLANA_NETWORK="devnet"
NEXT_PUBLIC_SOLANA_RPC_URL="https://api.devnet.solana.com"
NEXT_PUBLIC_SOLANA_RPC_WS_URL="wss://api.devnet.solana.com"
NEXT_PUBLIC_UMBRA_INDEXER_API_ENDPOINT="https://indexer.umbraprivacy.com"
NEXT_PUBLIC_UMBRA_RELAYER_API_ENDPOINT="https://replace-with-umbra-relayer.example"
NEXT_PUBLIC_CLOAK_RELAY_URL="https://api.devnet.cloak.ag"
```

Cloak execution uses `@cloak.dev/sdk-devnet` with the connected wallet adapter, the devnet Cloak program, the devnet relay, and Solana devnet RPC. Umbra execution uses `@umbra-privacy/sdk` and `@umbra-privacy/web-zk-prover` for receiver-claimable SPL UTXOs.

Umbra support includes creating receiver-claimable SPL token UTXOs, scanning received claimables, and claiming them into the recipient encrypted balance when the recipient wallet, indexer, relayer, and prover configuration are available.
