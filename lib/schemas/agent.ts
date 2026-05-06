import { z } from "zod";

export const agentAdvisorySchema = z.object({
  summary: z.string().min(1),
  questions: z.array(z.string()),
  suggestions: z.array(z.string()),
  nextAction: z.string().min(1),
  authorityBoundary: z.string().min(1)
});

export type AgentAdvisory = z.infer<typeof agentAdvisorySchema>;
