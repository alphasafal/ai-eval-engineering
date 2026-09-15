import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { EvalRun } from "./types";

export const RESULTS_DIR = "results";

export function resultPath(version: string): string {
  return join(RESULTS_DIR, `${version}.json`);
}

export async function saveRun(run: EvalRun): Promise<string> {
  const path = resultPath(run.meta.promptVersion);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(run, null, 2) + "\n", "utf8");
  return path;
}

export async function loadRun(version: string): Promise<EvalRun> {
  const path = resultPath(version);
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch {
    throw new Error(`No results at ${path}. Run "npm run eval:${version}" first.`);
  }
  const run = JSON.parse(text) as Partial<EvalRun>;
  if (!run.meta || !run.metrics || !Array.isArray(run.records)) {
    throw new Error(`${path} is not a valid result file. Re-run "npm run eval:${version}".`);
  }
  return run as EvalRun;
}
