import { describe, expect, it } from "vitest";
import { getTokenDecimals, toUmbraClaimExecutionReferences, toUmbraExecutionReferences } from "@/lib/privacy/umbraClient";

describe("Umbra client helpers", () => {
  it("formats Umbra SDK signature arrays into proof references", () => {
    expect(toUmbraExecutionReferences(["sig-1", "sig-2"], "op-1", "recipient-wallet", "mint-address")).toEqual([
      {
        protocol: "umbra",
        signature: "sig-1",
        label: "umbra-receiver-claimable-utxo-1",
        metadata: {
          operationId: "op-1",
          recipient: "recipient-wallet",
          tokenMint: "mint-address"
        }
      },
      {
        protocol: "umbra",
        signature: "sig-2",
        label: "umbra-receiver-claimable-utxo-2",
        metadata: {
          operationId: "op-1",
          recipient: "recipient-wallet",
          tokenMint: "mint-address"
        }
      }
    ]);
  });

  it("formats current Umbra SDK object results into proof references", () => {
    const references = toUmbraExecutionReferences(
      {
        createProofAccountSignature: "proof-sig",
        createUtxoSignature: "utxo-sig",
        closeProofAccountSignature: "close-sig"
      },
      "op-1",
      "recipient-wallet",
      "mint-address"
    );

    expect(references.map((reference) => reference.signature)).toEqual(["proof-sig", "utxo-sig", "close-sig"]);
  });

  it("drops empty signatures from Umbra SDK results", () => {
    expect(toUmbraExecutionReferences(["sig-1", "", "sig-2"], "op-1", "recipient-wallet", "mint-address")).toHaveLength(2);
  });

  it("uses stablecoin decimals and defaults other tokens to 9 decimals", () => {
    expect(getTokenDecimals("USDC")).toBe(6);
    expect(getTokenDecimals("USDT")).toBe(6);
    expect(getTokenDecimals("SOL")).toBe(9);
  });

  it("formats Umbra claim batch signatures into proof references", () => {
    const references = toUmbraClaimExecutionReferences(
      {
        batches: new Map([
          [0, { txSignature: "claim-tx-1", callbackSignature: "claim-callback-1" }],
          [1, { txSignature: "claim-tx-2" }]
        ])
      },
      "op-claim"
    );

    expect(references.map((reference) => reference.signature)).toEqual(["claim-tx-1", "claim-callback-1", "claim-tx-2"]);
    expect(references.every((reference) => reference.protocol === "umbra")).toBe(true);
  });
});
