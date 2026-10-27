# Eval setup audit

2 pass, 2 warn, 3 fail, 1 skipped. Static checks only; read each item before acting.

- [x] **Eval framework detected** (PASS)
  - Found: OpenAI hosted Evals API (run_evals.py)
- [ ] **No dependency on OpenAI hosted Evals** (FAIL)
  - Found: Calls the OpenAI Evals API in: run_evals.py
  - Why: OpenAI's deprecations page says existing evals become read-only on 31 Oct 2026 and the Evals dashboard and API are scheduled to shut down on 30 Nov 2026. Code that calls the Evals API will stop working. Export the evals and move them to a tool you run yourself.
  - Sources: https://developers.openai.com/api/docs/deprecations , https://github.com/evalsreview/openai-evals-migration
- [!] **Held-out test set kept apart from dev data** (WARN)
  - Found: Dataset files found (data/items.jsonl) but none named as a held-out/test split.
  - Why: If you tune prompts on the same examples you score on, the score goes up without the system getting better. OpenAI's eval best-practices guide describes measuring on a held-out set. We look for files or folders named test, holdout, held_out or heldout among the dataset files.
  - Sources: https://developers.openai.com/api/docs/guides/evaluation-best-practices
- [!] **Temperature or seed pinned** (WARN)
  - Found: No temperature: 0 or seed setting found in eval configs or CI. Fine if you average over repeats on purpose; say so in the README.
  - Why: With default sampling settings the same prompt can give different answers, so two runs of the same eval can disagree. Pinning temperature (often 0) and, where the provider supports it, a seed makes runs easier to compare. Inspect documents --seed and --temperature options; seeds are only supported by some providers.
  - Sources: https://inspect.aisi.org.uk/options.html , https://www.promptfoo.dev/docs/configuration/guide/
- [ ] **Evals run in CI** (FAIL)
  - Found: No CI config found.
  - Why: Evals that only run by hand stop being run. A CI job that runs the suite and exits non-zero on failure catches regressions before merge. We only check that a CI step runs an eval tool, not that it fails the build. promptfoo and DeepEval both document running in CI.
  - Sources: https://www.promptfoo.dev/docs/integrations/github-action/ , https://deepeval.com/docs/evaluation-unit-testing-in-ci-cd
- [-] **LLM judges have a written rubric** (SKIP)
  - Found: No LLM-judge assertions (llm-rubric, g-eval, GEval) found.
  - Why: An LLM judge asked only 'is this good?' scores inconsistently. promptfoo's llm-rubric takes the rubric as its value, and DeepEval's GEval takes criteria or evaluation_steps. We flag judges where that text is missing or very short (under 20 characters).
  - Sources: https://www.promptfoo.dev/docs/configuration/expected-outputs/model-graded/llm-rubric/ , https://deepeval.com/docs/metrics-llm-evals
- [ ] **Dataset licence stated** (FAIL)
  - Found: No licence covering: data
  - Why: Without a licence, default copyright applies, so others (and sometimes your own company) may not be allowed to reuse the data. If you pulled a public benchmark, its licence also limits what you can do with it. We look for a LICENSE file or a licence line in a README in the data folder or the repo root.
  - Sources: https://choosealicense.com/no-permission/
- [x] **No API keys written in eval files** (PASS)
  - Found: No key-shaped strings found.

Legend: [x] pass, [!] warn, [ ] fail, [-] skipped. Made by Evals Review (https://evalsreview.com).
