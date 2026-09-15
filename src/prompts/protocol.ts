import { ACTIONS, INTENTS } from "../schemas/agent-response";

/**
 * The turn protocol is shared by every prompt version so that an A/B
 * comparison measures the *instructions*, not a different wire format.
 */
export const TURN_PROTOCOL = `
Reply with exactly one JSON object per turn.

To call a tool:
{"type": "tool_call", "tool": "<tool name>", "arguments": {}}

Tool results arrive as a message starting with TOOL_RESULT or TOOL_ERROR.

To finish:
{"type": "final", "intent": "<intent>", "action": "<action>", "escalate": <true|false>, "confidence": <0..1>, "response": "<message to the customer>"}

Allowed intents: ${INTENTS.join(", ")}
Allowed actions: ${ACTIONS.join(", ")}
Available tools: lookup_transaction, lookup_order, check_refund_policy, open_fraud_case, escalate_to_human
`.trim();

export interface PromptVersion {
  id: string;
  label: string;
  system: string;
}
