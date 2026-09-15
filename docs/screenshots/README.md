# Screenshots

Place captured images here. Suggested filenames, matching [../linkedin-demo.md](../linkedin-demo.md):

| File | Content | Command |
|---|---|---|
| `01-dataset.png` | Dataset examples | open `dataset/cases.jsonl` |
| `02-v1-eval.png` | V1 terminal result | `npm run eval:v1` |
| `03-v2-eval.png` | V2 terminal result | `npm run eval:v2` |
| `04-comparison.png` | V1 vs V2 comparison | `npm run eval:compare` |
| `05-failure-analysis.png` | Failure analysis | `npm run eval:v1 -- --failures 4` |
| `06-release-gate.png` | Release gate (FAIL vs PASS) | `npm run eval:v1`, `npm run eval:v2` |
| `07-html-report.png` | HTML dashboard | open `reports/eval-report.html` |

Rules:

- Capture from a fresh `npm run eval` on the committed code. Never edit numbers in an image.
- Keep the "MOCK PROVIDER DEMONSTRATION" label visible when using the mock provider.
- If you switch to a real provider, say which model and date in the caption.
