-- ShadeOps Supabase REST schema.
-- Run this in the Supabase SQL editor for the project used by SUPABASE_URL.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new."updatedAt" = now();
  return new;
end;
$$;

create table if not exists public."Workspace" (
  "id" text primary key default gen_random_uuid()::text,
  "slug" text not null unique,
  "name" text not null,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table if not exists public."WorkspaceMember" (
  "id" text primary key default gen_random_uuid()::text,
  "workspaceId" text not null references public."Workspace"("id") on delete cascade,
  "walletAddress" text not null,
  "role" text not null check ("role" in ('owner', 'admin', 'reviewer')),
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  unique ("workspaceId", "walletAddress")
);

create index if not exists "WorkspaceMember_walletAddress_idx" on public."WorkspaceMember" ("walletAddress");

create table if not exists public."Contact" (
  "id" text primary key default gen_random_uuid()::text,
  "workspaceId" text not null default 'default' references public."Workspace"("id") on delete cascade,
  "label" text not null,
  "walletAddress" text not null,
  "role" text not null,
  "allowedTokens" jsonb not null default '[]'::jsonb,
  "status" text not null,
  "source" text not null,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  unique ("workspaceId", "label")
);

create index if not exists "Contact_workspaceId_walletAddress_idx" on public."Contact" ("workspaceId", "walletAddress");

create table if not exists public."TreasuryConfig" (
  "id" text primary key default gen_random_uuid()::text,
  "workspaceId" text not null unique default 'default' references public."Workspace"("id") on delete cascade,
  "label" text not null,
  "walletAddress" text not null,
  "network" text not null,
  "source" text not null,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table if not exists public."PayoutOperation" (
  "id" text primary key default gen_random_uuid()::text,
  "workspaceId" text not null default 'default',
  "operationId" text not null unique,
  "treasuryWallet" text not null,
  "parsedOperation" jsonb not null,
  "policyResult" jsonb not null,
  "routeDecision" jsonb not null,
  "recipientSource" text,
  "adminWallet" text,
  "createdAt" timestamptz not null default now()
);

create table if not exists public."ProofRecord" (
  "id" text primary key default gen_random_uuid()::text,
  "workspaceId" text not null default 'default',
  "operationId" text not null unique,
  "proofPackage" jsonb not null,
  "decisionHash" text not null,
  "adminWallet" text,
  "adminApprovedAt" timestamptz not null,
  "createdAt" timestamptz not null default now()
);

create table if not exists public."WalletSessionAudit" (
  "id" text primary key default gen_random_uuid()::text,
  "walletAddress" text not null,
  "event" text not null,
  "createdAt" timestamptz not null default now()
);

drop trigger if exists "Workspace_set_updated_at" on public."Workspace";
create trigger "Workspace_set_updated_at"
before update on public."Workspace"
for each row execute function public.set_updated_at();

drop trigger if exists "WorkspaceMember_set_updated_at" on public."WorkspaceMember";
create trigger "WorkspaceMember_set_updated_at"
before update on public."WorkspaceMember"
for each row execute function public.set_updated_at();

drop trigger if exists "Contact_set_updated_at" on public."Contact";
create trigger "Contact_set_updated_at"
before update on public."Contact"
for each row execute function public.set_updated_at();

drop trigger if exists "TreasuryConfig_set_updated_at" on public."TreasuryConfig";
create trigger "TreasuryConfig_set_updated_at"
before update on public."TreasuryConfig"
for each row execute function public.set_updated_at();

alter table public."Workspace" enable row level security;
alter table public."WorkspaceMember" enable row level security;
alter table public."Contact" enable row level security;
alter table public."TreasuryConfig" enable row level security;
alter table public."PayoutOperation" enable row level security;
alter table public."ProofRecord" enable row level security;
alter table public."WalletSessionAudit" enable row level security;

grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- ShadeOps server uses SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS.
-- Do not expose the service role key to the browser.
