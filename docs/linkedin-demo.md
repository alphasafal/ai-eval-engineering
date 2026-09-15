# LinkedIn / Practical AI post — what to capture

Every number below comes from running the harness. Before capturing, regenerate the results so the screenshots match the code:

```bash
npm install
npm run eval        # writes results/v1.json, results/v2.json, reports/eval-report.html
```

Use a dark terminal at roughly 100 columns with a readable font size (16–18pt). Put a "Mock provider demonstration" label in the post: the responses are simulated and the metrics are computed from them.

---

## SCREENSHOT 1 — Dataset examples

**Capture:** `dataset/cases.jsonl` in your editor, scrolled so a few contrasting cases are visible, for example `ref-004` (injection + refund), `dup-003` (angry, should not escalate), `fr-004` (phishing, no tool), and `adv-006` (delimiter escape).

Tip: for a readable view, run `node -e 'require("fs").readFileSync("dataset/cases.jsonl","utf8").trim().split("\n").slice(0,3).forEach(l=>console.log(JSON.stringify(JSON.parse(l),null,2)))'`.

**What this proves:** "Good" was defined before any prompt was written: 50 labelled cases, including the awkward ones (injection, angry customers who should *not* be escalated, requests that need no tool).

## SCREENSHOT 2 — V1 evaluation result

**Capture:** `npm run eval:v1`, from **OUTCOME QUALITY** to **SYSTEM**.

Current mock values: intent 60.0%, action 50.0%, escalation 72.0%, schema validity 96.0%, safety 70.0%, retry rate 26.0%.

**What this proves:** The baseline prompt reads fine but fails measurably. Half of its next-step decisions are wrong, and 30% of cases break a safety rule.

## SCREENSHOT 3 — V2 evaluation result

**Capture:** `npm run eval:v2`, same sections.

Current mock values: intent 96.0%, action 96.0%, escalation 100%, schema validity 100%, safety 100%, retry rate 2.0%.

**What this proves:** Same dataset, same graders, different instructions, and the difference is measured instead of felt.

## SCREENSHOT 4 — V1 vs V2 comparison

**Capture:** `npm run eval:compare` — the whole table, including the `34 case(s) fixed · 0 regressed · 2 still failing` line.

**What this proves:** V2 is better on quality, but it costs more. Tokens per task go from 615 to 1788, and average latency rises (1.60s → 1.88s, simulated). A better prompt is not automatically a better product, and the regression count shows nothing got quietly broken.

## SCREENSHOT 5 — Failure analysis

**Capture:** the **FAILURE ANALYSIS** section of `npm run eval:v1 -- --failures 4`: the counts by type, the Patterns list, and a few failed cases with expected vs actual.

Lines worth having in frame:
- `6/6 refund_request cases failed; most common cause: action check_refund_policy → respond_without_tool (6/6).`
- `9 case(s) triggered safety rule "promises_refund" …`
- `3/4 unnecessary escalations involve tag "angry-customer".`

**What this proves:** Failures are grouped and counted, so you know exactly what to fix next. V1 promises refunds without checking policy, and escalates because a customer is angry rather than because policy requires it.

## SCREENSHOT 6 — Release gate

**Capture:** the **RELEASE GATE** block from V1 (FAIL with reasons) next to V2 (PASS).

**What this proves:** Shipping is a rule, not a vibe. The gate lists which criteria failed and by how much, and `npm run eval:ci` can enforce it in CI.

## SCREENSHOT 7 — HTML dashboard

**Capture:** open `reports/eval-report.html` in a browser. Take one screenshot of the top (comparison table + gate pills) and optionally one of a failed-cases table.

**What this proves:** The same computed results are shareable with people who will never open a terminal: PMs, reviewers, or a release meeting.

---

## Suggested post skeleton

> **Stop prompt engineering. Start eval engineering.**
>
> I rewrote a support agent's prompt and V2 "felt better". Instead of trusting that, I built an evaluation harness:
>
> • 50 labelled cases, including prompt injection, fraud, and angry customers who should *not* be escalated
> • deterministic graders for schema, intent, action, escalation, and safety
> • an LLM-judge rubric, used only where code can't check
> • outcome **and** trajectory metrics, plus latency, tokens, and cost
> • a release gate that says PASS or FAIL, with reasons
>
> Result (mock provider demo, metrics computed by the harness): action accuracy 50% → 96%, safety 70% → 100%, 34 cases fixed, 0 regressed.
> And V2 uses ~3× the tokens per task. Better quality isn't free, and now that trade-off is visible.
>
> Code: github.com/alphasafal/ai-eval-engineering

If you change the code or dataset, rerun `npm run eval` and update the numbers in the post from the new output.
