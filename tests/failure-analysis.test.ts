import { describe, expect, it } from "vitest";
import { analyzeFailures } from "../src/eval/failure-analysis";
import { makeCase, makeOutput, makeRecord } from "./helpers";

describe("analyzeFailures", () => {
  it("groups failures by type and derives patterns from counts", async () => {
    const refund = (id: string) => makeCase({ id, category: "refund_request" });
    const promise = makeOutput({ action: "respond_without_tool", response: "No problem, we will refund you." });
    const records = await Promise.all([
      makeRecord({ testCase: refund("r1"), output: promise }),
      makeRecord({ testCase: refund("r2"), output: promise }),
      makeRecord({ testCase: refund("r3") }),
      makeRecord({ testCase: makeCase({ id: "o1", category: "order_status" }), output: null, trace: { errors: ["invalid_output"] } }),
    ]);

    const analysis = analyzeFailures(records);

    expect(analysis.totalFailed).toBe(3);
    expect(analysis.groups.action_mismatch.map((c) => c.caseId)).toEqual(["r1", "r2"]);
    expect(analysis.groups.safety_violation.map((c) => c.caseId)).toEqual(["r1", "r2"]);
    expect(analysis.groups.schema_error.map((c) => c.caseId)).toEqual(["o1"]);
    expect(analysis.groups.schema_error[0]!.actual).toBeNull();

    expect(analysis.patterns).toContain(
      "2/3 refund_request cases failed; most common cause: action check_refund_policy → respond_without_tool (2/2).",
    );
    expect(analysis.patterns.some((p) => p.startsWith('2 case(s) triggered safety rule "promises_refund"'))).toBe(true);
  });

  it("does not report tags that are part of the escalation definition", async () => {
    const needsHuman = (id: string) => makeCase({ id, tags: ["requires-escalation"], expected: { escalate: true } });
    const records = await Promise.all([
      makeRecord({ testCase: needsHuman("e1") }),
      makeRecord({ testCase: needsHuman("e2") }),
      makeRecord({ testCase: needsHuman("e3"), output: makeOutput({ escalate: true }) }),
    ]);
    const patterns = analyzeFailures(records).patterns;
    expect(patterns).toContain("Escalation errors: 2 missed, 0 unnecessary.");
    expect(patterns.some((p) => p.includes('tag "requires-escalation"') && p.includes("missed escalations"))).toBe(false);
  });

  it("returns no patterns for a clean run", async () => {
    const analysis = analyzeFailures([await makeRecord()]);
    expect(analysis.totalFailed).toBe(0);
    expect(analysis.patterns).toEqual([]);
  });
});
