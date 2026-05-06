import { z } from "zod";

export const policyStatusSchema = z.enum(["pass", "needs_review", "blocked"]);

export const policyRuleResultSchema = z.object({
  ruleId: z.string(),
  status: policyStatusSchema,
  message: z.string()
});

export const policyResultSchema = z.object({
  status: policyStatusSchema,
  ruleResults: z.array(policyRuleResultSchema)
});

export type PolicyStatus = z.infer<typeof policyStatusSchema>;
export type PolicyRuleResult = z.infer<typeof policyRuleResultSchema>;
export type PolicyResult = z.infer<typeof policyResultSchema>;
