import { describe, expect, it } from "vitest";
import { loadDataset, parseDataset } from "../src/eval/dataset";
import { ACTIONS, INTENTS } from "../src/schemas/agent-response";

const line = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    id: "ok-001",
    category: "general_question",
    input: "Do you accept Amex?",
    expected: { intent: "general_question", action: "respond_without_tool", escalate: false },
    ...overrides,
  });

describe("parseDataset", () => {
  it("parses JSONL, skips blank lines and applies defaults", () => {
    const ds = parseDataset(`${line()}\n\n${line({ id: "ok-002" })}\n`);
    expect(ds.cases).toHaveLength(2);
    expect(ds.cases[0]!.mustInclude).toEqual([]);
    expect(ds.fingerprint).toMatch(/^[0-9a-f]{8}$/);
  });

  it("reports the line number of invalid JSON", () => {
    expect(() => parseDataset(`${line()}\n{not json`, "cases.jsonl")).toThrow("cases.jsonl:2: invalid JSON");
  });

  it("rejects labels outside the schema", () => {
    const bad = line({ expected: { intent: "cancel", action: "respond_without_tool", escalate: false } });
    expect(() => parseDataset(bad)).toThrow(/expected\.intent/);
  });

  it("rejects duplicate ids", () => {
    expect(() => parseDataset(`${line()}\n${line()}`)).toThrow(/duplicate case id "ok-001"/);
  });

  it("changes fingerprint when the data changes", () => {
    expect(parseDataset(line()).fingerprint).not.toBe(parseDataset(line({ input: "Do you accept Visa?" })).fingerprint);
  });
});

describe("dataset/cases.jsonl", () => {
  it("is valid and covers every intent and action", async () => {
    const ds = await loadDataset("dataset/cases.jsonl");
    expect(ds.cases.length).toBeGreaterThanOrEqual(40);
    const intents = new Set(ds.cases.map((c) => c.expected.intent));
    const actions = new Set(ds.cases.map((c) => c.expected.action));
    for (const intent of INTENTS) expect(intents, `missing intent ${intent}`).toContain(intent);
    for (const action of ACTIONS) expect(actions, `missing action ${action}`).toContain(action);
  });

  it("includes both escalation outcomes and adversarial coverage", async () => {
    const { cases } = await loadDataset("dataset/cases.jsonl");
    const tags = new Set(cases.flatMap((c) => c.tags));
    expect(cases.some((c) => c.expected.escalate)).toBe(true);
    expect(cases.some((c) => !c.expected.escalate)).toBe(true);
    for (const tag of ["prompt-injection", "privacy", "angry-customer", "should-not-escalate", "no-tool-needed"]) {
      expect(tags, `missing tag ${tag}`).toContain(tag);
    }
  });

  it("has no duplicate inputs", async () => {
    const { cases } = await loadDataset("dataset/cases.jsonl");
    expect(new Set(cases.map((c) => c.input.toLowerCase())).size).toBe(cases.length);
  });
});
