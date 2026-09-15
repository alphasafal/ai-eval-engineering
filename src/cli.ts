import { mkdir, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import chalk from "chalk";
import dotenv from "dotenv";
import { compareRuns } from "./eval/compare";
import { loadDataset } from "./eval/dataset";
import type { JudgeConfig } from "./eval/grade-case";
import { loadRun, saveRun } from "./eval/results-store";
import { runEvaluation } from "./eval/runner";
import type { EvalRun } from "./eval/types";
import { getPrompt, PROMPTS } from "./prompts";
import { createProvider } from "./providers";
import { renderHtmlReport } from "./reporting/html";
import { createProgressBar, printBanner, printComparison, printRunHeader, printRunReport } from "./reporting/terminal";

dotenv.config({ quiet: true });

const REPORT_PATH = "reports/eval-report.html";

const HELP = `
Usage: tsx src/cli.ts <command> [options]

Commands
  run <v1|v2>   Evaluate one prompt version and save results/<version>.json
  compare       Compare results/v1.json with results/v2.json
  report        Write ${REPORT_PATH} from saved results
  all           run v1, run v2, compare, report (default for "npm run eval")

Options
  --dataset <path>    Dataset file (default: dataset/cases.jsonl)
  --judge <mode>      mock | model | off (default: EVAL_JUDGE or mock)
  --limit <n>         Evaluate only the first n cases
  --failures <n>      Failed cases to print in detail (default: 8)
  --ci                Exit with code 1 when the release gate fails
`;

async function main(): Promise<number> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      dataset: { type: "string", default: "dataset/cases.jsonl" },
      judge: { type: "string" },
      limit: { type: "string" },
      failures: { type: "string" },
      ci: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  const [command, arg] = positionals;
  if (values.help || !command) {
    console.log(HELP);
    return 0;
  }

  switch (command) {
    case "run": {
      if (!arg) throw new Error(`"run" needs a prompt version: ${Object.keys(PROMPTS).join(", ")}`);
      printBanner();
      const run = await evaluate(arg, values);
      printRunReport(run, { failureDetails: intOption(values.failures, 8) });
      return values.ci && !run.gate.passed ? 1 : 0;
    }
    case "compare": {
      const [v1, v2] = await Promise.all([loadRun("v1"), loadRun("v2")]);
      const comparison = compareRuns(v1, v2);
      printComparison(comparison);
      return values.ci && (!comparison.candidate.gatePassed || comparison.regressed.length > 0) ? 1 : 0;
    }
    case "report": {
      await writeReport(await loadAvailableRuns());
      return 0;
    }
    case "all": {
      printBanner();
      const runs: EvalRun[] = [];
      for (const version of ["v1", "v2"]) {
        log(chalk.bold.magenta(`\n▶ ${version.toUpperCase()}`));
        const run = await evaluate(version, values);
        printRunReport(run, { failureDetails: intOption(values.failures, 3) });
        runs.push(run);
      }
      const comparison = compareRuns(runs[0]!, runs[1]!);
      printComparison(comparison);
      await writeReport(runs);
      return values.ci && !comparison.candidate.gatePassed ? 1 : 0;
    }
    default:
      console.log(HELP);
      throw new Error(`Unknown command "${command}"`);
  }
}

async function evaluate(version: string, values: { dataset?: string; judge?: string; limit?: string }): Promise<EvalRun> {
  const prompt = getPrompt(version);
  const dataset = await loadDataset(values.dataset ?? "dataset/cases.jsonl");
  const limit = values.limit ? intOption(values.limit, dataset.cases.length) : dataset.cases.length;
  dataset.cases = dataset.cases.slice(0, limit);

  const provider = createProvider(process.env.AI_PROVIDER, process.env.AI_MODEL, process.env);
  const judge = createJudge(values.judge ?? process.env.EVAL_JUDGE);

  printRunHeader({
    provider: provider.name,
    model: provider.model,
    isMock: provider.name === "mock",
    promptLabel: prompt.label,
    datasetPath: dataset.path,
    caseCount: dataset.cases.length,
    judgeMode: judge.mode,
  });

  const progress = createProgressBar(dataset.cases.length);
  const run = await runEvaluation({
    dataset,
    prompt,
    provider,
    judge,
    concurrency: intOption(process.env.EVAL_CONCURRENCY, 4),
    onProgress: progress,
  });
  const path = await saveRun(run);
  log(chalk.dim(`  Raw results saved to ${path}`));
  return run;
}

function createJudge(mode: string | undefined): JudgeConfig {
  switch ((mode ?? "mock").toLowerCase()) {
    case "off":
      return { mode: "off" };
    case "mock":
      return { mode: "mock" };
    case "model":
      return { mode: "model", provider: createProvider(process.env.JUDGE_PROVIDER, process.env.JUDGE_MODEL, process.env) };
    default:
      throw new Error(`Unknown judge mode "${mode}". Use mock, model or off.`);
  }
}

async function loadAvailableRuns(): Promise<EvalRun[]> {
  const settled = await Promise.allSettled([loadRun("v1"), loadRun("v2")]);
  const runs = settled.flatMap((s) => (s.status === "fulfilled" ? [s.value] : []));
  if (runs.length === 0) throw new Error(`No results found. Run "npm run eval" first.`);
  return runs;
}

async function writeReport(runs: EvalRun[]): Promise<void> {
  const [v1, v2] = [runs.find((r) => r.meta.promptVersion === "v1"), runs.find((r) => r.meta.promptVersion === "v2")];
  const comparison = v1 && v2 ? compareRuns(v1, v2) : null;
  await mkdir("reports", { recursive: true });
  await writeFile(REPORT_PATH, renderHtmlReport(runs, comparison), "utf8");
  log(`\n  ${chalk.bold("HTML report:")} ${REPORT_PATH}\n`);
}

function intOption(value: string | undefined, fallback: number): number {
  if (value === undefined || value === "") return fallback;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < 0) throw new Error(`Expected a non-negative integer, got "${value}"`);
  return n;
}

function log(line: string): void {
  console.log(line);
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(chalk.red(`\nError: ${err instanceof Error ? err.message : String(err)}`));
    process.exit(2);
  },
);
