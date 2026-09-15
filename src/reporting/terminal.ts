import chalk from "chalk";
import type { GateMetric } from "../../config/release-gate";
import { SEMANTIC_DIMENSIONS } from "../graders/semantic-grader";
import type { Comparison } from "../eval/compare";
import type { FailureAnalysis } from "../eval/failure-analysis";
import type { GateResult } from "../eval/release-gate";
import { FAILURE_TYPES, type EvalRun, type RunMeta } from "../eval/types";
import { formatDelta, formatUnit, truncate, type Unit } from "./format";

const WIDTH = 64;
const log = (line = "") => console.log(line);
const rule = (char = "─") => chalk.dim(char.repeat(WIDTH));
const section = (title: string) => {
  log();
  log(chalk.bold.cyan(title));
  log(rule());
};

export function printBanner(): void {
  log();
  log(chalk.bold("═".repeat(WIDTH)));
  log(chalk.bold("  AI EVAL ENGINEERING"));
  log(chalk.dim("  Stop prompt engineering. Start eval engineering."));
  log(chalk.bold("═".repeat(WIDTH)));
}

export function printRunHeader(meta: Pick<RunMeta, "provider" | "model" | "isMock" | "promptLabel" | "datasetPath" | "caseCount" | "judgeMode">): void {
  const kv = (k: string, v: string) => log(`  ${chalk.dim(k.padEnd(10))} ${v}`);
  const mockNote = meta.isMock ? chalk.yellow(" · MOCK PROVIDER DEMONSTRATION (simulated responses)") : "";
  kv("Provider", `${meta.provider} (${meta.model})${mockNote}`);
  kv("Prompt", chalk.bold(meta.promptLabel));
  kv("Dataset", `${meta.datasetPath} · ${meta.caseCount} cases`);
  kv("Judge", meta.judgeMode === "mock" ? "mock (simulated, deterministic)" : meta.judgeMode);
  log();
}

export function createProgressBar(total: number): (done: number) => void {
  const size = 28;
  const interactive = process.stdout.isTTY;
  log(chalk.dim("  Running evaluations..."));
  return (done) => {
    if (!interactive && done !== total) return;
    const filled = Math.round((done / total) * size);
    const bar = chalk.green("█".repeat(filled)) + chalk.dim("░".repeat(size - filled));
    process.stdout.write(`${interactive ? "\r" : ""}  [${bar}] ${done}/${total}${done === total ? "\n" : ""}`);
  };
}

function metricLine(label: string, value: string, status?: "pass" | "fail" | "skipped", extra = ""): void {
  const mark = status === "pass" ? chalk.green("✓") : status === "fail" ? chalk.red("✗") : " ";
  // Pad before colouring: ANSI codes would otherwise count towards the width.
  const padded = value.padStart(10);
  const shown = status === "fail" ? chalk.red(padded) : status === "pass" ? chalk.green(padded) : padded;
  log(`  ${mark} ${label.padEnd(30)} ${shown}  ${chalk.dim(extra)}`);
}

export function printRunReport(run: EvalRun, options: { failureDetails: number }): void {
  const { metrics: m, gate } = run;
  const statusOf = (metric: GateMetric) => gate.criteria.find((c) => c.metric === metric)?.status;
  const pct = (v: number | null) => formatUnit("percent", v);

  section("OUTCOME QUALITY");
  metricLine("Pass rate (all graders)", pct(m.passRate), undefined, `${m.passedCases}/${m.totalCases} cases`);
  metricLine("Intent accuracy", pct(m.intentAccuracy), statusOf("intentAccuracy"));
  metricLine("Action accuracy", pct(m.actionAccuracy), statusOf("actionAccuracy"));
  metricLine("Escalation accuracy", pct(m.escalationAccuracy), statusOf("escalationAccuracy"), `${m.missedEscalations} missed · ${m.unnecessaryEscalations} unnecessary`);
  metricLine("Schema validity", pct(m.schemaValidity), statusOf("schemaValidity"));
  metricLine("Safety pass rate", pct(m.safetyPassRate), statusOf("safetyPassRate"), `${m.safetyViolations} violation(s)`);
  metricLine("Required content", pct(m.requiredContentPassRate));
  metricLine("Forbidden content avoided", pct(m.forbiddenContentPassRate));

  if (m.semantic) {
    section(`SEMANTIC  ${chalk.dim(m.semantic.mode === "mock" ? "(mock judge — simulated scores, 1–5)" : "(LLM judge — non-deterministic, 1–5)")}`);
    for (const d of SEMANTIC_DIMENSIONS) metricLine(labelize(d), formatUnit("score", m.semantic.averages?.[d] ?? null));
    metricLine("Overall", formatUnit("score", m.semantic.overall), statusOf("semanticOverall"), m.semantic.judgeErrors ? `${m.semantic.judgeErrors} judge error(s)` : "");
  }

  section("EXECUTION QUALITY (trajectory)");
  metricLine("Efficient trajectories", pct(m.trajectory.efficientRate));
  metricLine("Avg tool calls / task", formatUnit("count", m.trajectory.avgToolCalls));
  metricLine("Avg model calls / task", formatUnit("count", m.trajectory.avgModelCalls));
  metricLine("Cases with redundant tool calls", pct(m.trajectory.redundantToolCallRate));
  metricLine("Cases with invalid tool calls", pct(m.trajectory.invalidToolCallRate), statusOf("invalidToolCallRate"));
  metricLine("Retry rate", pct(m.trajectory.retryRate));

  section(`SYSTEM  ${chalk.dim(m.latency.source === "simulated" ? "(latency simulated by mock provider)" : "")}`);
  metricLine("Average latency", formatUnit("ms", m.latency.avgMs));
  metricLine("P50 latency", formatUnit("ms", m.latency.p50Ms));
  metricLine("P95 latency", formatUnit("ms", m.latency.p95Ms), statusOf("p95LatencyMs"));
  metricLine("Average tokens / task", formatUnit("count", Math.round(m.tokens.avgPerCase)));
  metricLine("Total tokens", m.tokens.total.toLocaleString("en-US"));
  metricLine("Avg cost / task", formatUnit("usd", m.cost.avgPerTaskUsd));
  metricLine("Total estimated cost", formatUnit("usd", m.cost.totalUsd), undefined, run.meta.pricingNote ?? "no pricing configured");

  printFailureAnalysis(run.failures, options.failureDetails);
  printGate(gate, run.meta.promptLabel);
}

export function printFailureAnalysis(analysis: FailureAnalysis, detailLimit: number): void {
  section(`FAILURE ANALYSIS  ${chalk.dim(`${analysis.totalFailed} failed case(s)`)}`);
  if (analysis.totalFailed === 0) {
    log(chalk.green("  No failures."));
    return;
  }
  for (const type of FAILURE_TYPES) {
    const count = analysis.groups[type].length;
    if (count > 0) log(`  ${labelize(type).padEnd(30)} ${chalk.red(String(count).padStart(4))}`);
  }
  if (analysis.patterns.length) {
    log();
    log(chalk.bold("  Patterns"));
    for (const p of analysis.patterns) log(`  • ${p}`);
  }
  if (detailLimit <= 0) return;

  const seen = new Set<string>();
  const cases = FAILURE_TYPES.flatMap((t) => analysis.groups[t]).filter((c) => !seen.has(c.caseId) && seen.add(c.caseId));
  log();
  log(chalk.bold(`  Failed cases ${chalk.dim(`(showing ${Math.min(detailLimit, cases.length)} of ${cases.length})`)}`));
  for (const c of cases.slice(0, detailLimit)) {
    const fmt = (x: { intent: string; action: string; escalate: boolean } | null) =>
      x ? `${x.intent} · ${x.action} · escalate=${x.escalate}` : chalk.red("no valid output");
    log(`  ${chalk.red("✗")} ${chalk.bold(c.caseId)} ${chalk.dim(`[${c.category}]`)} "${truncate(c.input, 60)}"`);
    log(`      ${chalk.dim("expected")} ${fmt(c.expected)}`);
    log(`      ${chalk.dim("actual  ")} ${fmt(c.actual)}`);
    log(`      ${chalk.dim("why     ")} ${chalk.yellow(c.reasons.join("; "))}`);
  }
}

export function printGate(gate: GateResult, label: string): void {
  section(`RELEASE GATE  ${chalk.dim(label)}`);
  for (const c of gate.criteria) {
    const mark = c.status === "pass" ? chalk.green("✓") : c.status === "fail" ? chalk.red("✗") : chalk.dim("–");
    log(`  ${mark} ${c.status === "fail" ? chalk.red(c.message) : c.status === "skipped" ? chalk.dim(c.message) : c.message}`);
  }
  log();
  if (gate.passed) {
    log(chalk.bgGreen.black.bold("  RELEASE GATE: PASS  "));
  } else {
    log(chalk.bgRed.white.bold("  RELEASE GATE: FAIL  "));
    log(chalk.red("  Reasons:"));
    for (const f of gate.failures) log(chalk.red(`  * ${f.message}`));
  }
}

export function printComparison(cmp: Comparison): void {
  log();
  log(chalk.bold("═".repeat(WIDTH + 12)));
  log(chalk.bold(`  AI EVAL COMPARISON   ${cmp.baseline.version.toUpperCase()} → ${cmp.candidate.version.toUpperCase()}`));
  log(chalk.bold("═".repeat(WIDTH + 12)));
  if (!cmp.sameDataset) log(chalk.yellow("  ⚠ Runs used different datasets — deltas are not comparable."));
  const head = `  ${"".padEnd(26)}${cmp.baseline.version.toUpperCase().padStart(11)}${cmp.candidate.version.toUpperCase().padStart(11)}${"CHANGE".padStart(14)}`;
  log(chalk.dim(head));
  log(rule());
  for (const row of cmp.rows) {
    const color = row.verdict === "improved" ? chalk.green : row.verdict === "regressed" ? chalk.red : chalk.dim;
    const u: Unit = row.unit;
    log(`  ${row.label.padEnd(26)}${formatUnit(u, row.baseline).padStart(11)}${formatUnit(u, row.candidate).padStart(11)}${color(formatDelta(u, row.delta).padStart(14))}`);
  }
  log(rule());
  const gate = (passed: boolean) => (passed ? chalk.green("PASS".padStart(11)) : chalk.red("FAIL".padStart(11)));
  log(`  ${"Release gate".padEnd(26)}${gate(cmp.baseline.gatePassed)}${gate(cmp.candidate.gatePassed)}`);
  log();
  log(`  ${chalk.green(`${cmp.fixed.length} case(s) fixed`)} · ${cmp.regressed.length ? chalk.red(`${cmp.regressed.length} regressed`) : chalk.dim("0 regressed")} · ${chalk.dim(`${cmp.stillFailing.length} still failing`)}`);
  for (const r of cmp.regressed) log(chalk.red(`  ↓ ${r.caseId}: ${r.candidateReasons.join("; ")}`));
  for (const s of cmp.stillFailing) log(chalk.dim(`  · still failing ${s.caseId}: ${s.candidateReasons.join("; ")}`));
}

function labelize(key: string): string {
  const spaced = key.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
