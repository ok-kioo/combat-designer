import { z } from "zod";

export const CompatibilityResultSchema = z.object({
  compatible: z.boolean(),
  conflict: z
    .object({
      conflict_type: z.string(),
      details: z.string(),
    })
    .optional(),
});

export type CompatibilityResult = z.infer<typeof CompatibilityResultSchema>;
