import { describe, expect, it, vi } from "vitest";
import { buildZerionWalletUrl, getZerionApiTreasuryContext, parseZerionApiTreasuryContext, parseZerionCliOutput, resolveZerionCliArgs } from "@/lib/treasury/zerionCli";

const TREASURY_WALLET = "TreasuryWallet111111111111111111111111111111";

describe("Zerion treasury observer", () => {
  it("builds portfolio, position, and transaction API URLs", () => {
    const positionsUrl = buildZerionWalletUrl(TREASURY_WALLET, "positions");
    const transactionsUrl = buildZerionWalletUrl(TREASURY_WALLET, "transactions");

    expect(positionsUrl.pathname).toBe(`/v1/wallets/${TREASURY_WALLET}/positions/`);
    expect(positionsUrl.searchParams.get("filter[positions]")).toBe("only_simple");
    expect(positionsUrl.searchParams.get("filter[position_types]")).toBe("wallet");
    expect(transactionsUrl.searchParams.get("page[size]")).toBe("10");
  });

  it("normalizes Zerion API portfolio, holdings, and recent outflow", () => {
    const context = parseZerionApiTreasuryContext(TREASURY_WALLET, {
      portfolio: {
        data: {
          attributes: {
            total: { positions: 8200.5 },
            changes: { absolute_1d: -120.25, percent_1d: -1.44 }
          }
        }
      },
      positions: {
        data: [
          {
            attributes: {
              quantity: { numeric: "5000" },
              fungible_info: { symbol: "USDC" },
              value: 5000,
              position_type: "wallet"
            },
            relationships: { chain: { data: { id: "solana" } } }
          },
          {
            attributes: {
              quantity: { numeric: "12.5" },
              fungible_info: { symbol: "SOL" },
              value: 3200.5,
              position_type: "wallet"
            },
            relationships: { chain: { data: { id: "solana" } } }
          }
        ]
      },
      transactions: {
        data: [
          {
            id: "tx-out",
            attributes: {
              hash: "abc123",
              mined_at: "2026-05-03T00:00:00Z",
              operation_type: "send",
              sent_from: TREASURY_WALLET,
              sent_to: "Recipient111111111111111111111111111111111",
              value: 240.75
            }
          },
          {
            id: "tx-in",
            attributes: {
              direction: "in",
              hash: "def456",
              value: 40
            }
          }
        ]
      }
    });

    expect(context.source).toBe("zerion-api");
    expect(context.portfolioValueUsd).toBe(8200.5);
    expect(context.portfolioChangeUsd1d).toBe(-120.25);
    expect(context.holdings).toHaveLength(2);
    expect(context.topPositions[0]).toMatchObject({ symbol: "USDC", valueUsd: 5000, chain: "solana" });
    expect(context.recentOutflowUsd).toBe(240.75);
    expect(context.recentTransactions[0]).toMatchObject({ direction: "out", hash: "abc123" });
  });

  it("normalizes flexible Zerion CLI output", () => {
    const context = parseZerionCliOutput(
      TREASURY_WALLET,
      JSON.stringify({
        totalValueUsd: "1500.25",
        holdings: [{ symbol: "USDC", balance: "1000", spendable: "1000", valueUsd: "1000", chain: "solana" }],
        transactions: [{ hash: "cli-tx", direction: "sent", valueUsd: "75.5" }]
      })
    );

    expect(context.source).toBe("zerion-cli");
    expect(context.portfolioValueUsd).toBe(1500.25);
    expect(context.recentOutflowUsd).toBe(75.5);
    expect(context.holdings[0]).toMatchObject({ symbol: "USDC", spendable: "1000", valueUsd: 1000 });
  });

  it("uses configured CLI args with wallet placeholder", () => {
    expect(resolveZerionCliArgs("wallet analyze {wallet} --json", TREASURY_WALLET)).toEqual(["wallet", "analyze", TREASURY_WALLET, "--json"]);
    expect(resolveZerionCliArgs("", TREASURY_WALLET)).toEqual(["wallet", TREASURY_WALLET, "--json"]);
  });

  it("fetches all Zerion API resources with Basic auth", async () => {
    const requests: Array<{ input: string | URL; init?: RequestInit }> = [];
    const fetcher = vi.fn(async (input: string | URL, init?: RequestInit) => {
      requests.push({ input, init });
      const url = new URL(String(input));
      const body = url.pathname.endsWith("/portfolio/")
        ? { data: { attributes: { total: 1 } } }
        : url.pathname.endsWith("/positions/")
          ? { data: [] }
          : { data: [] };

      return new Response(JSON.stringify(body), { status: 200 });
    });

    await getZerionApiTreasuryContext(TREASURY_WALLET, "zk_test_key", fetcher);

    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(requests[0].init?.headers).toMatchObject({
      Authorization: `Basic ${Buffer.from("zk_test_key:").toString("base64")}`,
      Accept: "application/json"
    });
  });
});
