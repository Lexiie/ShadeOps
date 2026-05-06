import { z } from "zod";

export const privacyRouteDecisionSchema = z.object({
  mode: z.enum(["umbra", "cloak"]),
  reasonCode: z.string(),
  explanation: z.string(),
  tradeoffs: z.array(z.string()).default([])
});

export type PrivacyRouteDecision = z.infer<typeof privacyRouteDecisionSchema>;
