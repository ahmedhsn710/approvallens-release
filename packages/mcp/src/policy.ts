import { z } from "zod";
import { ScopeSchema } from "../../core/src/scope";
export const IntegrationPolicy = z.strictObject({
  version: z.literal(1),
  taskId: z.string().min(1).max(128),
  developerIntent: z.string().min(1).max(4096),
  grants: ScopeSchema.shape.grants,
  shellInspection: z.boolean().optional(),
  blockedTerms: z.array(z.string().min(4).max(200)).max(50).optional(),
  constraints: ScopeSchema.shape.constraints,
  evidence: ScopeSchema.shape.evidence,
});
export type IntegrationPolicy = z.infer<typeof IntegrationPolicy>;
