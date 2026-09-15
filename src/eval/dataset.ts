import { readFile } from "node:fs/promises";
import { EvalCaseSchema, type EvalCase } from "../schemas/eval-case";
import { stableHash } from "../observability/hash";

export interface Dataset {
  path: string;
  cases: EvalCase[];
  /** Fingerprint so comparisons can detect that two runs used different data. */
  fingerprint: string;
}

export function parseDataset(content: string, path = "<inline>"): Dataset {
  const cases: EvalCase[] = [];
  const ids = new Set<string>();

  content.split("\n").forEach((line, index) => {
    if (line.trim() === "") return;
    const where = `${path}:${index + 1}`;
    let json: unknown;
    try {
      json = JSON.parse(line);
    } catch {
      throw new Error(`${where}: invalid JSON`);
    }
    const result = EvalCaseSchema.safeParse(json);
    if (!result.success) {
      const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new Error(`${where}: invalid eval case (${issues})`);
    }
    if (ids.has(result.data.id)) throw new Error(`${where}: duplicate case id "${result.data.id}"`);
    ids.add(result.data.id);
    cases.push(result.data);
  });

  if (cases.length === 0) throw new Error(`${path}: dataset is empty`);
  return { path, cases, fingerprint: stableHash(content).toString(16).padStart(8, "0") };
}

export async function loadDataset(path: string): Promise<Dataset> {
  return parseDataset(await readFile(path, "utf8"), path);
}
