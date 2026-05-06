import { z } from "zod";

export const contactRoleSchema = z.enum(["contributor", "vendor", "grantee", "contractor", "operator"]);
export const contactStatusSchema = z.enum(["active", "needs_review", "blocked"]);

export const contactSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1, "Contact name is required."),
  walletAddress: z.string().min(32, "Wallet address is required."),
  role: contactRoleSchema,
  allowedTokens: z.array(z.string().min(2)).min(1),
  status: contactStatusSchema,
  source: z.string().min(1),
  updatedAt: z.string()
});

export const contactInputSchema = contactSchema.omit({ id: true, updatedAt: true }).extend({
  id: z.string().min(1).optional()
});

export const recipientResolutionSchema = z.object({
  status: z.enum(["resolved", "unresolved"]),
  source: z.enum(["address_book", "intent", "manual_required"]),
  label: z.string(),
  walletAddress: z.string().min(32).optional(),
  message: z.string()
});

export type Contact = z.infer<typeof contactSchema>;
export type ContactInput = z.infer<typeof contactInputSchema>;
export type RecipientResolution = z.infer<typeof recipientResolutionSchema>;
