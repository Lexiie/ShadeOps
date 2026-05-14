import { z } from "zod";

export const treasuryNetworkSchema = z.literal("devnet");
export const treasurySourceSchema = z.enum(["manual", "squads", "realms", "program"]);

export const treasuryConfigSchema = z.object({
  label: z.string().min(1, "Treasury label is required."),
  walletAddress: z.string().min(32, "Treasury wallet address is required."),
  network: treasuryNetworkSchema,
  source: treasurySourceSchema,
  updatedAt: z.string()
});

export const treasuryConfigInputSchema = treasuryConfigSchema.omit({ updatedAt: true });

export type TreasuryConfig = z.infer<typeof treasuryConfigSchema>;
export type TreasuryConfigInput = z.infer<typeof treasuryConfigInputSchema>;
