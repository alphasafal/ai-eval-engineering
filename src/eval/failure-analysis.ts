import type { Action, Intent } from "../schemas/agent-response";
import { FAILURE_TYPES, type CaseRecord, type FailureType } from "./types";

export interface FailedCase {
  caseId: string;
  category: string;
  input: string;
  expected: { intent: Intent; action: Action; escalate: boolean };
  actual: { intent: Intent; action: Action; escalate: boolean } | null;
  types: FailureType[];
  reasons: string[];
}

export interface FailureAnalysis {
  totalFailed: number;
  groups: Record<FailureType, FailedCase[]>;
  /** Plain-language observations. Each is computed from counts in the records — nothing is inferred beyond them. */
  patterns: string[];
}

export function analyzeFailures(records: CaseRecord[]): FailureAnalysis {
  const failed = records.filter((r) => !r.passed);
  const groups = Object.fromEntries(FAILURE_TYPES.map((t) => [t, [] as FailedCase[]])) as Record<FailureType, FailedCase[]>;

  for (const r of failed) {
    const summary = toFailedCase(r);
    const types = r.failureTypes.length ? r.failureTypes : (["other"] as FailureType[]);
    for (const type of types) groups[type].push(summary);
  }

  const patterns = [
    ...categoryPatterns(records),
    ...safetyPatterns(records),
    ...escalationPatterns(records),
    ...tagPatterns(records),
    ...schemaPatterns(records),
    ...trajectoryPatterns(records),
  ];

  return { totalFailed: failed.length, groups, patterns };
}

function toFailedCase(r: CaseRecord): FailedCase {
  return {
    caseId: r.caseId,
    category: r.category,
    input: r.input,
    expected: { intent: r.expectedIntent, action: r.expectedAction, escalate: r.expectedEscalate },
    actual: r.output ? { intent: r.output.intent, action: r.output.action, escalate: r.output.escalate } : null,
    types: r.failureTypes,
    reasons: r.failureReasons,
  };
}

/** Concrete causes for one failed record, used to find the dominant cause within a group. */
function causesOf(r: CaseRecord): string[] {
  if (!r.schemaValid) return ["invalid output (schema error)"];
  const causes: string[] = [];
  if (r.intent !== r.expectedIntent) causes.push(`intent ${r.expectedIntent} → ${r.intent}`);
  if (r.action !== r.expectedAction) causes.push(`action ${r.expectedAction} → ${r.action}`);
  if (r.grades.escalation.error) causes.push(r.grades.escalation.error.replace("_", " "));
  for (const v of r.grades.safety.violations) causes.push(`safety rule ${v.ruleId}`);
  if (!r.grades.requiredContent.passed) causes.push("missing required content");
  return causes;
}

function mostCommon(items: string[]): [string, number] | undefined {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
}

function groupBy<T>(items: T[], key: (item: T) => string[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) for (const k of key(item)) map.set(k, [...(map.get(k) ?? []), item]);
  return map;
}

function categoryPatterns(records: CaseRecord[]): string[] {
  const out: string[] = [];
  for (const [category, rows] of groupBy(records, (r) => [r.category])) {
    const failed = rows.filter((r) => !r.passed);
    if (failed.length < 2 || failed.length / rows.length < 0.4) continue;
    const top = mostCommon(failed.flatMap(causesOf));
    const cause = top ? `; most common cause: ${top[0]} (${top[1]}/${failed.length})` : "";
    out.push(`${failed.length}/${rows.length} ${category} cases failed${cause}.`);
  }
  return out;
}

function safetyPatterns(records: CaseRecord[]): string[] {
  const hits = records.flatMap((r) => r.grades.safety.violations.map((v) => ({ v, r })));
  const byRule = groupBy(hits, (h) => [h.v.ruleId]);
  return [...byRule.entries()].map(([ruleId, list]) => {
    const categories = [...new Set(list.map((h) => h.r.category))].join(", ");
    return `${list.length} case(s) triggered safety rule "${ruleId}" — ${list[0]!.v.description.toLowerCase()} (categories: ${categories}).`;
  });
}

function escalationPatterns(records: CaseRecord[]): string[] {
  const out: string[] = [];
  const missed = records.filter((r) => r.grades.escalation.error === "missed_escalation");
  const unnecessary = records.filter((r) => r.grades.escalation.error === "unnecessary_escalation");
  if (missed.length + unnecessary.length === 0) return out;
  out.push(`Escalation errors: ${missed.length} missed, ${unnecessary.length} unnecessary.`);
  for (const [label, rows, expectedEscalate] of [["missed", missed, true], ["unnecessary", unnecessary, false]] as const) {
    if (rows.length < 2) continue;
    // Compare against cases with the same expected escalation, so a tag that is
    // simply part of the definition (e.g. "requires-escalation") is not reported.
    const population = records.filter((r) => r.expectedEscalate === expectedEscalate);
    const concentrated = [...groupBy(rows, (r) => r.tags).entries()]
      .map(([tag, hits]) => ({ tag, hits: hits.length, lift: hits.length / rows.length / (population.filter((r) => r.tags.includes(tag)).length / population.length) }))
      .filter((t) => t.hits / rows.length >= 0.6 && t.lift >= 1.5)
      .sort((a, b) => b.hits - a.hits || b.lift - a.lift)[0];
    if (concentrated) out.push(`${concentrated.hits}/${rows.length} ${label} escalations involve tag "${concentrated.tag}".`);
  }
  return out;
}

/** Tags that fail noticeably more often than the run as a whole (top 5). */
function tagPatterns(records: CaseRecord[]): string[] {
  const overall = records.filter((r) => !r.passed).length / records.length;
  return [...groupBy(records, (r) => r.tags).entries()]
    .map(([tag, rows]) => ({ tag, total: rows.length, failed: rows.filter((r) => !r.passed).length }))
    .filter((t) => t.total >= 3 && t.failed / t.total >= 0.5 && t.failed / t.total >= overall + 0.15)
    .sort((a, b) => b.failed / b.total - a.failed / a.total || b.total - a.total)
    .slice(0, 5)
    .map((t) => `Tag "${t.tag}": ${t.failed}/${t.total} cases failed (run average ${Math.round(overall * 100)}%).`);
}

function schemaPatterns(records: CaseRecord[]): string[] {
  const retried = records.filter((r) => r.retries > 0);
  if (retried.length === 0) return [];
  const neverValid = retried.filter((r) => !r.schemaValid).length;
  return [`${retried.length} case(s) needed a format retry to produce valid JSON; ${neverValid} never did.`];
}

function trajectoryPatterns(records: CaseRecord[]): string[] {
  const inefficientButPassed = records.filter((r) => r.passed && !r.grades.trajectory.efficient);
  if (inefficientButPassed.length === 0) return [];
  const redundant = inefficientButPassed.filter((r) => r.grades.trajectory.redundantToolCalls > 0).length;
  const invalid = inefficientButPassed.filter((r) => r.grades.trajectory.invalidToolCalls > 0).length;
  const retried = inefficientButPassed.filter((r) => r.retries > 0).length;
  return [
    `${inefficientButPassed.length} case(s) passed on outcome but had an inefficient trajectory (redundant tools: ${redundant}, invalid tools: ${invalid}, retries: ${retried}).`,
  ];
}
