# Contributing

Thanks for helping improve AI Eval Engineering. This project is a small reference implementation, so changes should keep it clear, deterministic by default, and easy to verify.

## Local verification

Run these before opening a pull request. None of them need an API key.

```bash
npm ci
npm run typecheck
npm test
npm run eval:ci
```

`npm run eval:ci` evaluates V2 with the deterministic mock provider and exits non-zero if the release gate fails. CI runs the same commands.

## Contribution principles

- **Prefer deterministic graders.** If code can verify a behaviour (schema, labels, forbidden content, safety patterns), don't use an LLM judge for it.
- **Add tests** for new graders, metrics, release-gate criteria, and agent behaviour.
- **Keep mock results labelled as simulated.** Mock-provider numbers demonstrate the pipeline; never present them as results from a real model.
- **Never commit API keys or `.env`.** Configuration belongs in environment variables; `.env.example` documents them.
- **Keep pricing configurable.** Don't hard-code "current" provider prices; they live in `config/model-pricing.ts` and are set by the user.
- **Preserve outcome vs trajectory.** Report whether the answer was right separately from how the agent got there.
- **Turn production failures into regression cases.** A fixed bug should come with a dataset case that would have caught it.

## Adding evaluation cases

Add one JSON object per line to `dataset/cases.jsonl`. Each case should include:

- a **stable, unique ID** (e.g. `ref-007`) that never gets reused;
- the **expected intent**, **expected action**, and **escalation expectation**;
- **content and safety constraints** via `mustInclude` / `mustNotInclude` where they matter;
- **useful tags** (e.g. `prompt-injection`, `should-not-escalate`, `no-tool-needed`) so failure analysis can find patterns;
- a **`notes` rationale** for ambiguous or contestable labels.

Follow the labelling policy in [docs/eval-design.md](docs/eval-design.md). If you disagree with a rule, change the policy and relabel every affected case rather than labelling one case differently.

## Pull requests

In the PR description, explain:

1. **What changed.**
2. **How it is evaluated** — which graders, cases, or gate criteria cover it.
3. **Test and eval coverage** — new or updated tests and dataset cases.
4. **Quality, cost, latency, and token implications** — include `npm run eval:compare` output when behaviour changes.
