# eval-setup-audit

A small, read-only checklist audit of a repo's LLM eval setup. It finds promptfoo, DeepEval, Ragas, Inspect, OpenAI Evals and Braintrust files, then checks eight common gaps and prints a Markdown checklist (or JSON). No dependencies, no network calls, no API keys needed.

```bash
# Node 20.11+
node audit.mjs path/to/your-repo            # Markdown checklist
node audit.mjs path/to/your-repo --json     # machine-readable
node audit.mjs path/to/your-repo --strict   # exit 1 if any check FAILs (use as a CI step)
```

An agent skill version is in [`SKILL.md`](SKILL.md).

## What it checks

Each item is a heuristic based on file names and text patterns. It can miss things and it can flag things you did on purpose. Read the "Found" line before acting.

| Check | FAIL / WARN when | Why it matters | Source |
| --- | --- | --- | --- |
| Eval framework detected | No promptfoo config, `deepeval` / `ragas` / `inspect_ai` / `braintrust` import, Braintrust `*.eval.ts`, openai/evals registry YAML or OpenAI Evals API call | Nothing else can be checked | - |
| No dependency on OpenAI hosted Evals | Code calls `client.evals.create`, `evals.runs.create` or `/v1/evals` | OpenAI lists existing evals as read-only from 31 Oct 2026 and the Evals dashboard and API as scheduled to shut down on 30 Nov 2026 | [OpenAI deprecations](https://developers.openai.com/api/docs/deprecations) (checked 27 Oct 2026); migration helper: [openai-evals-migration](https://github.com/evalsreview/openai-evals-migration) |
| Held-out test set | Dataset files exist but none is named `test`, `holdout`, `held_out` or `heldout` (WARN) | Tuning on the examples you score on inflates the score | [OpenAI evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices) |
| Temperature or seed pinned | No `temperature: 0`, `seed: N`, `--temperature 0` or `--seed N` in eval configs or CI (WARN) | Two runs of the same eval can disagree; seeds work only on some providers | [Inspect options](https://inspect.aisi.org.uk/options.html), [promptfoo config guide](https://www.promptfoo.dev/docs/configuration/guide/) |
| Evals run in CI | No CI config, or CI never calls an eval tool. We don't check that the step fails the build | Evals run by hand stop being run | [promptfoo GitHub Action](https://www.promptfoo.dev/docs/integrations/github-action/), [DeepEval in CI/CD](https://deepeval.com/docs/evaluation-unit-testing-in-ci-cd) |
| LLM judges have a written rubric | `llm-rubric` / `g-eval` with no value or a value under 20 characters; `GEval(...)` without `evaluation_steps` or a 20+ character `criteria` | A judge with no rubric scores inconsistently | [promptfoo llm-rubric](https://www.promptfoo.dev/docs/configuration/expected-outputs/model-graded/llm-rubric/), [DeepEval G-Eval](https://deepeval.com/docs/metrics-llm-evals) |
| Dataset licence stated | Data files with no LICENSE or licence line in a README covering them (FAIL); only a repo-root licence (WARN) | Without a licence default copyright applies; a code licence can't relicense a benchmark you copied in | [choosealicense.com: No license](https://choosealicense.com/no-permission/) |
| No API keys in eval files | A string shaped like `sk-...` or `sk-ant-...` | Configs get committed; keys belong in env vars. The key itself is never printed | - |

The 20-character rubric cut-off is our own rule of thumb, not a number from any vendor.

## Testing

We tested this **only on the small synthetic fixtures in `examples/fixtures/`** (made up by us; not real projects) and on temporary files built inside the tests. We have not run it on third-party repos yet, so expect false positives and misses.

- `node --test tests/`: 11 tests, 11 pass on Node v20.19.2 (27 Oct 2026). Full log: [`examples/test-run-2026-10-27.txt`](examples/test-run-2026-10-27.txt). Rerun with `./scripts-run-tests.sh`.
- Sample report for the `bad-hosted` fixture: [`examples/sample-report-bad-hosted.md`](examples/sample-report-bad-hosted.md).

## Limits

- Static text matching only. It does not run your evals or read your eval results.
- Files over 512 KB and `node_modules`, `.git`, virtualenvs and build folders are skipped.
- It cannot tell whether a "test" file is really held out from prompt tuning.

## Licence

MIT. Made by [Evals Review](https://evalsreview.com). Issues and pull requests welcome.
