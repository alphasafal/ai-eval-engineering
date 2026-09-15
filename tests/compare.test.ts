import { describe, expect, it } from "vitest";
import { compareRuns } from "../src/eval/compare";
import { makeCase, makeEvalRun, makeOutput, makeRecord } from "./helpers";

const wrongAction = makeOutput({ action: "respond_without_tool" });

describe("compareRuns", () => {
  it("computes deltas and judges direction per metric", async () => {
    const baseline = makeEvalRun(
      await Promise.all([
        makeRecord({ testCase: makeCase({ id: "a" }), trace: { latencyMs: 2000 } }),
        makeRecord({ testCase: makeCase({ id: "b" }), output: wrongAction, trace: { latencyMs: 2000 } }),
      ]),
      "v1",
    );
    const candidate = makeEvalRun(
      await Promise.all([
        makeRecord({ testCase: makeCase({ id: "a" }), trace: { latencyMs: 1000 } }),
        makeRecord({ testCase: makeCase({ id: "b" }), trace: { latencyMs: 1000 } }),
      ]),
      "v2",
    );

    const cmp = compareRuns(baseline, candidate);
    const row = (label: string) => cmp.rows.find((r) => r.label === label)!;

    expect(row("Action accuracy")).toMatchObject({ baseline: 0.5, candidate: 1, delta: 0.5, verdict: "improved" });
    // Lower latency is better, so a negative delta is an improvement.
    expect(row("Average latency")).toMatchObject({ delta: -1000, verdict: "improved" });
    expect(row("Intent accuracy").verdict).toBe("unchanged");
    expect(row("Semantic score").verdict).toBe("n/a");
    expect(cmp.sameDataset).toBe(true);
  });

  it("surfaces per-case regressions that an improved average would hide", async () => {
    const ids = ["a", "b", "c"];
    const baseline = makeEvalRun(
      await Promise.all(ids.map((id) => makeRecord({ testCase: makeCase({ id }), output: id === "a" ? makeOutput() : wrongAction }))),
      "v1",
    );
    const candidate = makeEvalRun(
      await Promise.all(ids.map((id) => makeRecord({ testCase: makeCase({ id }), output: id === "a" ? wrongAction : makeOutput() }))),
      "v2",
    );

    const cmp = compareRuns(baseline, candidate);
    expect(cmp.fixed.map((c) => c.caseId)).toEqual(["b", "c"]);
    expect(cmp.regressed.map((c) => c.caseId)).toEqual(["a"]);
    expect(cmp.regressed[0]!.candidateReasons[0]).toContain("expected action");
  });

  it("warns when runs used different datasets", async () => {
    const record = await makeRecord();
    const cmp = compareRuns(makeEvalRun([record], "v1", "aaaa"), makeEvalRun([record], "v2", "bbbb"));
    expect(cmp.sameDataset).toBe(false);
  });
});
