import { TOOL_ACTIONS } from "../schemas/agent-response";
import type { GraderInput } from "./types";

/**
 * Execution quality, graded separately from outcome quality.
 * An agent can reach the right answer through a wasteful or risky path.
 */
export interface TrajectoryGrade {
  efficient: boolean;
  toolCallCount: number;
  invalidToolCalls: number;
  /** Valid tool calls that were not the final action, or repeated calls. */
  redundantToolCalls: number;
  /** The final answer claims a tool action that was never executed. */
  unexecutedAction: boolean;
  retries: number;
  issues: string[];
}

export function gradeTrajectory({ run }: GraderInput): TrajectoryGrade {
  const { toolsCalled, invalidToolCalls, retries, errors } = run.trace;
  const finalAction = run.output?.action;

  const seen = new Set<string>();
  let redundant = 0;
  for (const tool of toolsCalled) {
    if (seen.has(tool) || tool !== finalAction) redundant++;
    seen.add(tool);
  }

  const isToolAction = (TOOL_ACTIONS as readonly string[]).includes(finalAction ?? "");
  const unexecutedAction = isToolAction && !seen.has(finalAction!);

  const issues: string[] = [];
  if (invalidToolCalls.length > 0) issues.push(`called unknown tool(s): ${invalidToolCalls.join(", ")}`);
  if (redundant > 0) issues.push(`${redundant} redundant tool call(s)`);
  if (unexecutedAction) issues.push(`claimed ${finalAction} without executing it`);
  if (retries > 0) issues.push(`${retries} format retr${retries === 1 ? "y" : "ies"}`);
  if (errors.length > 0) issues.push(...errors);

  return {
    efficient: issues.length === 0,
    toolCallCount: toolsCalled.length + invalidToolCalls.length,
    invalidToolCalls: invalidToolCalls.length,
    redundantToolCalls: redundant,
    unexecutedAction,
    retries,
    issues,
  };
}
