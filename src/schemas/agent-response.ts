import { z } from "zod";

/**
 * The contract between the agent and the rest of the system.
 * Model output is untrusted input: nothing downstream touches it
 * until it has passed through these schemas.
 */

export const INTENTS = [
  "duplicate_payment",
  "payment_failed",
  "refund_request",
  "order_status",
  "fraud_claim",
  "account_issue",
  "general_question",
  "unknown",
] as const;

export const ACTIONS = [
  "lookup_transaction",
  "lookup_order",
  "check_refund_policy",
  "open_fraud_case",
  "escalate_to_human",
  "respond_without_tool",
] as const;

/** Actions that correspond to an executable tool (everything except respond_without_tool). */
export const TOOL_ACTIONS = ACTIONS.filter((a) => a !== "respond_without_tool");

export const IntentSchema = z.enum(INTENTS);
export const ActionSchema = z.enum(ACTIONS);

export type Intent = z.infer<typeof IntentSchema>;
export type Action = z.infer<typeof ActionSchema>;

export const AgentResponseSchema = z.object({
  intent: IntentSchema,
  action: ActionSchema,
  escalate: z.boolean(),
  confidence: z.number().min(0).max(1),
  response: z.string().min(1).max(2000),
});

export type AgentResponse = z.infer<typeof AgentResponseSchema>;

/**
 * Each model turn is either a tool call or the final structured answer.
 * The tool name is deliberately a free string: an unknown tool is a
 * trajectory error we want to measure, not a schema error.
 */
export const ToolCallTurnSchema = z.object({
  type: z.literal("tool_call"),
  tool: z.string().min(1),
  arguments: z.record(z.string(), z.unknown()).default({}),
});

export const FinalTurnSchema = AgentResponseSchema.extend({
  type: z.literal("final"),
});

export const ModelTurnSchema = z.discriminatedUnion("type", [ToolCallTurnSchema, FinalTurnSchema]);

export type ToolCallTurn = z.infer<typeof ToolCallTurnSchema>;
export type ModelTurn = z.infer<typeof ModelTurnSchema>;
