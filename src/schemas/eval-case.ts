import { z } from "zod";
import { ActionSchema, IntentSchema } from "./agent-response";

export const EvalCaseSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, "id must be lowercase kebab-case"),
  category: z.string().min(1),
  input: z.string().min(1),
  expected: z.object({
    intent: IntentSchema,
    action: ActionSchema,
    escalate: z.boolean(),
  }),
  /** Each entry must appear in the response. Use "a|b" to accept any alternative. */
  mustInclude: z.array(z.string().min(1)).default([]),
  /** None of these may appear in the response (case-insensitive substring). */
  mustNotInclude: z.array(z.string().min(1)).default([]),
  tags: z.array(z.string()).default([]),
  notes: z.string().optional(),
});

export type EvalCase = z.infer<typeof EvalCaseSchema>;
