#!/usr/bin/env node
// Authoritative enforcement of ESLint's `react-hooks/rules-of-hooks` across
// both React apps. Each app's own ESLint config already enables the rule
// (mobile via the @react-native preset, dashboard via the flat recommended
// config) and already loads the right TS parser + plugin — so we run each
// app's local ESLint and filter the JSON output down to ONLY this one rule.
//
// Why not just `eslint .` in CI? Both apps have dozens of pre-existing,
// unrelated lint findings; gating on the full lint would be red from day one.
// Isolating rules-of-hooks keeps the gate meaningful and noise-free.
//
// This is the thorough companion to scripts/check-hooks-order.mjs: the regex
// scanner is a zero-install fast guard; ESLint understands real control flow
// (Hooks inside conditionals, loops, callbacks) that the regex can't see.
//
// Requires each app's node_modules to be installed. Exits 1 on any violation.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const APPS = [
  { name: 'TaxiMobile', dir: 'TaxiMobile' },
  { name: 'TaxiDashboard', dir: 'TaxiDashboard' },
];

const RULE = 'react-hooks/rules-of-hooks';
let violations = 0;
let hardError = false;

for (const app of APPS) {
  if (!existsSync(app.dir)) {
    console.error(`! ${app.name}: directory not found, skipping`);
    continue;
  }

  // Invoke the app's local ESLint JS entry directly with node — no shell and
  // no .cmd shim, which keeps it cross-platform (Node 24 blocks spawning .cmd
  // without a shell). ESLint exits non-zero whenever ANY rule reports an
  // error, so we parse regardless of exit code and decide pass/fail purely
  // from the rules-of-hooks messages.
  const eslintBin = resolve(app.dir, 'node_modules', 'eslint', 'bin', 'eslint.js');
  if (!existsSync(eslintBin)) {
    console.error(`! ${app.name}: ESLint not installed (run npm ci in ${app.dir})`);
    hardError = true;
    continue;
  }
  const res = spawnSync(
    process.execPath,
    [eslintBin, 'src', '--format', 'json'],
    {
      cwd: app.dir,
      encoding: 'utf8',
      // JSON output over a whole src tree easily exceeds the 1 MB default.
      maxBuffer: 64 * 1024 * 1024,
    }
  );

  if (!res.stdout || !res.stdout.trim().startsWith('[')) {
    console.error(`! ${app.name}: ESLint produced no JSON output`);
    console.error(res.stderr || '(no stderr)');
    hardError = true;
    continue;
  }

  let report;
  try {
    report = JSON.parse(res.stdout);
  } catch (e) {
    console.error(`! ${app.name}: could not parse ESLint output — ${e.message}`);
    hardError = true;
    continue;
  }

  let appHits = 0;
  for (const file of report) {
    for (const m of file.messages) {
      if (m.ruleId === RULE) {
        appHits++;
        violations++;
        const rel = file.filePath.replace(/\\/g, '/');
        console.error(`${rel}:${m.line}:${m.column}  ${m.message}`);
      }
    }
  }
  console.log(`  ${app.name}: ${appHits} ${RULE} violation(s)`);
}

if (hardError) {
  console.error('\n✖ ESLint could not run in one or more apps (see above).');
  process.exit(2);
}
if (violations > 0) {
  console.error(`\n✖ ${violations} ${RULE} violation(s) found.`);
  process.exit(1);
}
console.log(`\n✓ No ${RULE} violations.`);
