import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { audit, toMarkdown } from "../audit.mjs";

const fx = (n) => path.join(import.meta.dirname, "..", "examples", "fixtures", n);
const st = (rep, id) => rep.results.find((r) => r.id === id).status;
const tmp = (files) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "esa-")); for (const [f, t] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), t); } return d; };

test("well-set-up promptfoo fixture passes every check", () => {
  const rep = audit(fx("good-promptfoo"));
  for (const r of rep.results) assert.equal(r.status, "pass", r.id);
});

test("OpenAI hosted Evals API use is flagged", () => {
  const rep = audit(fx("bad-hosted"));
  assert.equal(st(rep, "hosted-lockin"), "fail");
  assert.equal(st(rep, "ci-gate"), "fail");
  assert.equal(st(rep, "dataset-licence"), "fail");
  assert.equal(st(rep, "held-out"), "warn");
  assert.equal(st(rep, "determinism"), "warn");
});

test("weak judges and CI without an eval step are flagged", () => {
  const rep = audit(fx("deepeval-weak"));
  assert.deepEqual(rep.frameworks.map((f) => f.id).sort(), ["deepeval", "promptfoo"]);
  assert.equal(st(rep, "judge-rubric"), "fail");
  const d = rep.results.find((r) => r.id === "judge-rubric").detail;
  assert.match(d, /llm-rubric value "good"/); assert.match(d, /GEval/);
  assert.equal(st(rep, "ci-gate"), "fail");
});

test("empty repo: no framework, other checks skip or fail, never crash", () => {
  const rep = audit(fx("empty"));
  assert.equal(st(rep, "frameworks"), "fail");
  assert.equal(st(rep, "determinism"), "skip");
  assert.equal(st(rep, "judge-rubric"), "skip");
});

test("GEval with evaluation_steps passes", () => {
  const d = tmp({ "t.py": 'from deepeval.metrics import GEval\nm = GEval(name="c", evaluation_steps=["Check facts against the context"], evaluation_params=[])\n' });
  assert.equal(st(audit(d), "judge-rubric"), "pass");
});

test("llm-rubric with no value fails; block-scalar rubric passes", () => {
  assert.equal(st(audit(tmp({ "promptfooconfig.yaml": "tests:\n  - assert:\n      - type: llm-rubric\n" })), "judge-rubric"), "fail");
  assert.equal(st(audit(tmp({ "promptfooconfig.yaml": "tests:\n  - assert:\n      - type: llm-rubric\n        value: |\n          Correct, cites the source, under 80 words.\n" })), "judge-rubric"), "pass");
});

test("Inspect, Ragas, Braintrust and openai/evals registry are detected", () => {
  const d = tmp({
    "a.py": "from inspect_ai import Task\n", "b.py": "import ragas\n",
    "c.eval.ts": 'import { Eval } from "braintrust";\n', "evals/registry/evals/x.yaml": "x: 1\n",
  });
  assert.deepEqual(audit(d).frameworks.map((f) => f.id).sort(), ["braintrust", "inspect", "openai-evals-oss", "ragas"]);
});

test("repo-root code licence only gives a warn for data", () => {
  const d = tmp({ "LICENSE": "MIT License\n", "data/x.jsonl": "{}\n", "promptfooconfig.yaml": "prompts: [a]\n" });
  assert.equal(st(audit(d), "dataset-licence"), "warn");
});

test("key-shaped strings are flagged and the key is not printed", () => {
  const fake = "sk-" + "x".repeat(30);
  const d = tmp({ "promptfooconfig.yaml": `providers:\n  - id: openai:gpt-4.1-mini\n    config: {apiKey: ${fake}}\n` });
  const rep = audit(d);
  assert.equal(st(rep, "no-inline-keys"), "fail");
  assert.ok(!toMarkdown(rep).includes(fake)); assert.ok(!JSON.stringify(rep).includes(fake));
});

test("node_modules is ignored", () => {
  const d = tmp({ "node_modules/x/promptfooconfig.yaml": "prompts: [a]\n" });
  assert.equal(st(audit(d), "frameworks"), "fail");
});

test("CLI: --json parses and --strict exits 1 on a FAIL, 0 when clean", () => {
  const cli = path.join(import.meta.dirname, "..", "audit.mjs");
  JSON.parse(execFileSync("node", [cli, fx("bad-hosted"), "--json"], { encoding: "utf8" }));
  assert.equal(spawnSync("node", [cli, fx("bad-hosted"), "--strict"]).status, 1);
  assert.equal(spawnSync("node", [cli, fx("good-promptfoo"), "--strict"]).status, 0);
  assert.equal(spawnSync("node", [cli, "/nonexistent-dir-xyz"]).status, 2);
});
