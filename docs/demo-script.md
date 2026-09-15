# 60–90 second demo script

Setup before recording: run `npm install` and `npm run eval` once so results exist. Clear the terminal, open `dataset/cases.jsonl` in an editor tab, and open `reports/eval-report.html` in a browser tab.

| Time | On screen | Say |
|---|---|---|
| **0–10s** | README title | "I changed a support agent's prompt and it *felt* better. But 'feels better' isn't a metric, so I built an eval harness to find out." |
| **10–20s** | `dataset/cases.jsonl`, scroll to `ref-004` and `dup-003` | "Fifty labelled cases for a fictional payments company. Refunds, fraud, prompt injection, and angry customers who should *not* be escalated. This is the definition of good, written before the prompt." |
| **20–35s** | `npm run eval:v1` → outcome quality and release gate | "Here's the baseline prompt. Action accuracy is 50%, and 30% of cases break a safety rule. It promises refunds it can't promise. The release gate fails, and it says exactly why." |
| **35–50s** | `npm run eval:v2` → outcome quality | "V2 adds intent definitions, tool rules, escalation rules and policy constraints. Same dataset, same graders: 96% action accuracy and 100% safety." |
| **50–65s** | `npm run eval:compare` | "The comparison: 34 cases fixed, zero regressed. But look at the cost. V2 uses about three times the tokens per task, and average latency went up. Better quality isn't free, and now that's visible." |
| **65–75s** | Scroll back to V1 failure patterns, then V2 `RELEASE GATE: PASS` | "Failure analysis grouped the problems for me: every refund case failed the same way, and most unnecessary escalations were just angry customers. V2 clears the gate. Two cases still fail, and they stay in the dataset." |
| **75–90s** | HTML report in browser | "Everything also lands in a static report. The takeaway: stop judging prompts by vibes. Define success, build the dataset, measure, and gate the release. And every production failure becomes a new test case." |

Say once, clearly, near the start: **"This demo uses a mock provider, so the responses are simulated, but every metric is computed by the harness."**

## Fallback short version (30s)

1. `npm run eval:compare`: "Same 50 cases, two prompts."
2. Point at action accuracy, safety, and tokens: "Better quality, higher cost."
3. Point at the gate row: "One fails, one passes, with reasons."
