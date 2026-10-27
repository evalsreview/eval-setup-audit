#!/usr/bin/env node
// eval-setup-audit: read-only static checks of a repo's LLM eval setup. No network, no dependencies.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SKIP = new Set(["node_modules", ".git", ".venv", "venv", "__pycache__", "dist", "build", ".next", ".promptfoo"]);
const TEXT = /\.(ya?ml|json|jsonl|py|ts|js|mjs|cjs|toml|cfg|ini|md|txt|csv)$/i;
const MAX = 512 * 1024;

export function listFiles(root) {
  const out = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP.has(e.name)) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) out.push(path.relative(root, p).split(path.sep).join("/"));
    }
  })(root);
  return out.sort();
}

export function loadRepo(root) {
  const files = listFiles(root);
  const text = {};
  for (const f of files) {
    if (!TEXT.test(f) && !/(^|\/)(LICEN[CS]E|COPYING)/i.test(f)) continue;
    const p = path.join(root, f);
    if (fs.statSync(p).size > MAX) continue;
    text[f] = fs.readFileSync(p, "utf8");
  }
  return { files, text };
}

const grep = (repo, re, fileRe = /./) => Object.entries(repo.text).filter(([f, t]) => fileRe.test(f) && re.test(t)).map(([f]) => f);
const CODE = /\.(py|ts|js|mjs|cjs)$/i;

export const FRAMEWORKS = [
  { id: "promptfoo", name: "promptfoo", find: (r) => r.files.filter((f) => /(^|\/)promptfooconfig\.(ya?ml|json|js|ts)$/i.test(f)) },
  { id: "deepeval", name: "DeepEval", find: (r) => grep(r, /^\s*(from\s+deepeval|import\s+deepeval)/m, CODE) },
  { id: "ragas", name: "Ragas", find: (r) => grep(r, /^\s*(from\s+ragas|import\s+ragas)/m, CODE) },
  { id: "inspect", name: "Inspect (inspect_ai)", find: (r) => grep(r, /^\s*(from\s+inspect_ai|import\s+inspect_ai)/m, CODE) },
  { id: "openai-hosted", name: "OpenAI hosted Evals API", find: (r) => grep(r, /\.evals\.(create|runs\.create)\s*\(|\/v1\/evals\b/, /\.(py|ts|js|mjs|cjs|sh|ya?ml)$/i) },
  { id: "openai-evals-oss", name: "openai/evals (open-source registry)", find: (r) => r.files.filter((f) => /(^|\/)evals\/registry\/evals\/.+\.ya?ml$/i.test(f)).concat(grep(r, /^\s*oaieval\s|\boaieval\b/m, /\.(sh|ya?ml|md)$/i)) },
  { id: "braintrust", name: "Braintrust", find: (r) => r.files.filter((f) => /\.eval\.(ts|js|mjs)$/i.test(f) && /from\s+["']braintrust["']/.test(r.text[f] || "")).concat(grep(r, /^\s*(from\s+braintrust\s+import|import\s+braintrust)/m, /\.py$/i)) },
];

const uniq = (a) => [...new Set(a)];
const DATA_RE = /\.(jsonl|csv)$|(^|\/)(data|datasets?|evals?\/data|golden)\//i;

export const CHECKS = [
  {
    id: "frameworks", title: "Eval framework detected",
    why: "If no eval framework or config is found, the other checks have nothing to look at.",
    sources: [],
    run(r, ctx) { return ctx.frameworks.length ? { status: "pass", detail: ctx.frameworks.map((f) => `${f.name} (${f.files.slice(0, 3).join(", ")})`).join("; ") } : { status: "fail", detail: "No promptfoo, DeepEval, Ragas, Inspect, OpenAI Evals or Braintrust files found." }; },
  },
  {
    id: "hosted-lockin", title: "No dependency on OpenAI hosted Evals",
    why: "OpenAI's deprecations page says existing evals become read-only on 31 Oct 2026 and the Evals dashboard and API are scheduled to shut down on 30 Nov 2026. Code that calls the Evals API will stop working. Export the evals and move them to a tool you run yourself.",
    sources: ["https://developers.openai.com/api/docs/deprecations", "https://github.com/evalsreview/openai-evals-migration"],
    run(r, ctx) { const f = ctx.byId["openai-hosted"]; return f ? { status: "fail", detail: `Calls the OpenAI Evals API in: ${f.join(", ")}` } : { status: "pass", detail: "No calls to the OpenAI Evals API found." }; },
  },
  {
    id: "held-out", title: "Held-out test set kept apart from dev data",
    why: "If you tune prompts on the same examples you score on, the score goes up without the system getting better. OpenAI's eval best-practices guide describes measuring on a held-out set. We look for files or folders named test, holdout, held_out or heldout among the dataset files.",
    sources: ["https://developers.openai.com/api/docs/guides/evaluation-best-practices"],
    run(r) {
      const data = r.files.filter((f) => DATA_RE.test(f));
      if (!data.length) return { status: "warn", detail: "No dataset files (.jsonl/.csv or a data/ folder) found, so we could not check for a split. Inline test cases are fine for small suites." };
      const held = data.filter((f) => /(^|[\/_.-])(test|holdout|held[_-]?out|heldout)([\/_.-]|$)/i.test(f));
      return held.length ? { status: "pass", detail: `Held-out files: ${held.slice(0, 5).join(", ")}` } : { status: "warn", detail: `Dataset files found (${data.slice(0, 3).join(", ")}) but none named as a held-out/test split.` };
    },
  },
  {
    id: "determinism", title: "Temperature or seed pinned",
    why: "With default sampling settings the same prompt can give different answers, so two runs of the same eval can disagree. Pinning temperature (often 0) and, where the provider supports it, a seed makes runs easier to compare. Inspect documents --seed and --temperature options; seeds are only supported by some providers.",
    sources: ["https://inspect.aisi.org.uk/options.html", "https://www.promptfoo.dev/docs/configuration/guide/"],
    run(r, ctx) {
      if (!ctx.frameworks.length) return { status: "skip", detail: "No eval setup found." };
      const files = uniq(ctx.frameworks.flatMap((f) => f.files)).concat(r.files.filter((f) => /(^|\/)\.github\/workflows\//.test(f)));
      const hit = files.filter((f) => /\btemperature["']?\s*[:=]\s*0(\.0+)?\b|--temperature[ =]0\b|\bseed["']?\s*[:=]\s*\d+|--seed[ =]\d+/i.test(r.text[f] || ""));
      return hit.length ? { status: "pass", detail: `Pinned in: ${hit.join(", ")}` } : { status: "warn", detail: "No temperature: 0 or seed setting found in eval configs or CI. Fine if you average over repeats on purpose; say so in the README." };
    },
  },
  {
    id: "ci-gate", title: "Evals run in CI",
    why: "Evals that only run by hand stop being run. A CI job that runs the suite and exits non-zero on failure catches regressions before merge. We only check that a CI step runs an eval tool, not that it fails the build. promptfoo and DeepEval both document running in CI.",
    sources: ["https://www.promptfoo.dev/docs/integrations/github-action/", "https://deepeval.com/docs/evaluation-unit-testing-in-ci-cd"],
    run(r) {
      const ci = r.files.filter((f) => /(^|\/)(\.github\/workflows\/.+\.ya?ml|\.gitlab-ci\.yml|\.circleci\/config\.yml|Jenkinsfile|azure-pipelines\.yml)$/i.test(f));
      if (!ci.length) return { status: "fail", detail: "No CI config found." };
      const hit = ci.filter((f) => /promptfoo|deepeval|ragas|inspect\s+eval|braintrust|oaieval|pytest[^\n]*eval|npm run (eval|test:eval)/i.test(r.text[f] || ""));
      return hit.length ? { status: "pass", detail: `Eval step in: ${hit.join(", ")}` } : { status: "fail", detail: `CI exists (${ci.join(", ")}) but no step runs the evals.` };
    },
  },
  {
    id: "judge-rubric", title: "LLM judges have a written rubric",
    why: "An LLM judge asked only 'is this good?' scores inconsistently. promptfoo's llm-rubric takes the rubric as its value, and DeepEval's GEval takes criteria or evaluation_steps. We flag judges where that text is missing or very short (under 20 characters).",
    sources: ["https://www.promptfoo.dev/docs/configuration/expected-outputs/model-graded/llm-rubric/", "https://deepeval.com/docs/metrics-llm-evals"],
    run(r) {
      const bad = [], found = [];
      for (const [f, t] of Object.entries(r.text)) {
        if (/\.ya?ml$/i.test(f)) {
          const re = /type:\s*["']?(llm-rubric|g-eval|model-graded-closedqa)["']?\s*\n(\s*)(?:(?:threshold|weight|provider|metric)[^\n]*\n\2)*value:\s*(.*)/g;
          const typeOnly = /type:\s*["']?(llm-rubric|g-eval)["']?\s*(\n|$)/g;
          let m; const seen = new Set();
          while ((m = re.exec(t))) { seen.add(m.index); found.push(f); const v = m[3].replace(/^["'|>-]+|["']$/g, "").trim(); if (v.length < 20 && !/^[|>]/.test(m[3].trim())) bad.push(`${f}: ${m[1]} value "${v}"`); }
          while ((m = typeOnly.exec(t))) { if (seen.has(m.index)) continue; const after = t.slice(m.index, m.index + 300); if (!/value:/.test(after.split(/\n\s*-\s/)[0])) { found.push(f); bad.push(`${f}: ${m[1]} with no value`); } }
        }
        if (/\.py$/i.test(f)) {
          const re = /GEval\s*\(([\s\S]*?)\)\s*(\n|$)/g; let m;
          while ((m = re.exec(t))) { found.push(f); const a = m[1]; const c = /criteria\s*=\s*["']([^"']*)["']/.exec(a); if (!/evaluation_steps\s*=/.test(a) && (!c || c[1].trim().length < 20)) bad.push(`${f}: GEval without evaluation_steps or a criteria of 20+ characters`); }
        }
      }
      if (!found.length) return { status: "skip", detail: "No LLM-judge assertions (llm-rubric, g-eval, GEval) found." };
      return bad.length ? { status: "fail", detail: bad.join("; ") } : { status: "pass", detail: `Judges with rubric text in: ${uniq(found).join(", ")}` };
    },
  },
  {
    id: "dataset-licence", title: "Dataset licence stated",
    why: "Without a licence, default copyright applies, so others (and sometimes your own company) may not be allowed to reuse the data. If you pulled a public benchmark, its licence also limits what you can do with it. We look for a LICENSE file or a licence line in a README in the data folder or the repo root.",
    sources: ["https://choosealicense.com/no-permission/"],
    run(r) {
      const data = r.files.filter((f) => DATA_RE.test(f));
      if (!data.length) return { status: "skip", detail: "No dataset files found." };
      const lic = r.files.filter((f) => /(^|\/)(LICEN[CS]E|COPYING)[^/]*$/i.test(f));
      const readmeLic = Object.entries(r.text).filter(([f, t]) => /(^|\/)(README|DATASET|DATA_CARD)[^/]*\.md$/i.test(f) && /licen[cs]e\s*[:\-]|\bCC[- ]BY|\bMIT\b|\bApache[- ]2/i.test(t)).map(([f]) => f);
      const dataDirs = uniq(data.map((f) => f.includes("/") ? f.slice(0, f.lastIndexOf("/")) : "."));
      const covered = dataDirs.filter((d) => lic.concat(readmeLic).some((l) => { const ld = l.includes("/") ? l.slice(0, l.lastIndexOf("/")) : "."; return ld === "." || d === ld || d.startsWith(ld + "/"); }));
      const dataSpecific = lic.concat(readmeLic).some((l) => DATA_RE.test(l) || /DATASET|DATA_CARD/i.test(l));
      if (covered.length === dataDirs.length && dataSpecific) return { status: "pass", detail: `Licence for data in: ${uniq(lic.concat(readmeLic)).join(", ")}` };
      if (covered.length === dataDirs.length) return { status: "warn", detail: "Only a repo-root licence found. A code licence (e.g. MIT) may not be what you want for the data, and it cannot relicense a public benchmark you copied in. Add a data licence note." };
      return { status: "fail", detail: `No licence covering: ${dataDirs.filter((d) => !covered.includes(d)).join(", ")}` };
    },
  },
  {
    id: "no-inline-keys", title: "No API keys written in eval files",
    why: "Eval configs get committed and shared. Keys belong in environment variables. We look for strings shaped like OpenAI (sk-...) or Anthropic (sk-ant-...) keys. We never print the key itself.",
    sources: [],
    run(r) {
      const hit = grep(r, /\bsk-(ant-)?[A-Za-z0-9_-]{20,}/);
      return hit.length ? { status: "fail", detail: `Key-shaped strings in: ${hit.join(", ")} (rotate them)` } : { status: "pass", detail: "No key-shaped strings found." };
    },
  },
];

export function audit(root) {
  const repo = loadRepo(root);
  const frameworks = FRAMEWORKS.map((f) => ({ ...f, files: uniq(f.find(repo)) })).filter((f) => f.files.length);
  const ctx = { frameworks, byId: Object.fromEntries(frameworks.map((f) => [f.id, f.files])) };
  const results = CHECKS.map((c) => ({ id: c.id, title: c.title, why: c.why, sources: c.sources, ...c.run(repo, ctx) }));
  return { root, frameworks: frameworks.map((f) => ({ id: f.id, name: f.name, files: f.files })), results };
}

const ICON = { pass: "[x]", warn: "[!]", fail: "[ ]", skip: "[-]" };
export function toMarkdown(rep) {
  const n = (s) => rep.results.filter((r) => r.status === s).length;
  const lines = [`# Eval setup audit`, ``, `${n("pass")} pass, ${n("warn")} warn, ${n("fail")} fail, ${n("skip")} skipped. Static checks only; read each item before acting.`, ``];
  for (const r of rep.results) {
    lines.push(`- ${ICON[r.status]} **${r.title}** (${r.status.toUpperCase()})`, `  - Found: ${r.detail}`);
    if (r.status !== "pass") lines.push(`  - Why: ${r.why}`);
    if (r.status !== "pass" && r.sources.length) lines.push(`  - Sources: ${r.sources.join(" , ")}`);
  }
  lines.push("", "Legend: [x] pass, [!] warn, [ ] fail, [-] skipped. Made by Evals Review (https://evalsreview.com).");
  return lines.join("\n") + "\n";
}

const isMain = process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  if (args.includes("-h") || args.includes("--help")) { console.log("Usage: eval-setup-audit [dir] [--json] [--strict]\n--strict exits 1 on any FAIL."); process.exit(0); }
  const dir = args.find((a) => !a.startsWith("--")) || ".";
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) { console.error(`Not a directory: ${dir}`); process.exit(2); }
  const rep = audit(path.resolve(dir));
  process.stdout.write(args.includes("--json") ? JSON.stringify(rep, null, 2) + "\n" : toMarkdown(rep));
  if (args.includes("--strict") && rep.results.some((r) => r.status === "fail")) process.exit(1);
}
