---
name: eval-setup-audit
description: Use when someone asks you to review or audit a repo's LLM eval setup (promptfoo, DeepEval, Ragas, Inspect, OpenAI Evals, Braintrust), or before trusting its eval scores. Runs a read-only checklist for OpenAI hosted Evals lock-in, held-out data, pinned temperature/seed, CI, judge rubrics, dataset licence and inline keys.
---

# Audit an LLM eval setup

1. Run `node audit.mjs <repo> --json` (Node 20.11+, no network, no keys).
2. For each FAIL or WARN, open the files named in `detail` and confirm it before reporting. The checks are text heuristics.
3. Report as a checklist: what was found, why it matters (use the `why` field), and the source links in `sources`. Do not add claims the sources don't support.
4. Priorities:
   - `hosted-lockin` FAIL: OpenAI's deprecations page lists existing evals as read-only from 31 Oct 2026 and the Evals dashboard and API as scheduled to shut down on 30 Nov 2026. Export first; https://github.com/evalsreview/openai-evals-migration converts exports to promptfoo.
   - `no-inline-keys` FAIL: tell the user to rotate the key. Never print it.
   - Then `ci-gate`, `judge-rubric`, `held-out`, `dataset-licence`, `determinism`.
5. To gate CI, add `node audit.mjs . --strict` as a step (exits 1 on any FAIL).
