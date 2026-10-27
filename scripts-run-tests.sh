#!/usr/bin/env bash
# Reproduces examples/test-run-*.txt. Needs Node 20.11+.
set -u
echo "## date: $(date -Iseconds)"; echo "## node: $(node --version)"
echo; echo '$ node --test tests/'; node --test tests/ 2>&1 | grep -E '^(ok|not ok|# (tests|pass|fail))'
for f in good-promptfoo bad-hosted deepeval-weak empty; do
  echo; echo "\$ node audit.mjs examples/fixtures/$f --json | summary"
  node audit.mjs examples/fixtures/$f --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{for(const r of JSON.parse(s).results)console.log(r.status.toUpperCase().padEnd(5),r.id)})'
done
