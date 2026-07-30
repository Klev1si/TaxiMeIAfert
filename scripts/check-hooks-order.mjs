#!/usr/bin/env node
// Static check for the React "Rendered more hooks than during the previous
// render" crash. It flags any Hook call that sits at a component's top level
// *after* an early `return` (a guard like `if (...) return null`). React
// requires every Hook to run on every render in the same order; a Hook below
// an early return runs on some renders but not others, changing the Hook count
// and crashing the component the moment its state transitions.
//
// This mirrors the real bug fixed in SubscriptionStatusBanner (useMemo was
// placed below `if (!loaded || state === 'active') return null`).
//
// Guards *inside* a Hook body (e.g. `useEffect(() => { if (!x) return; })`)
// are legal and are NOT flagged, because they live below the component's
// top-level brace depth.
//
// Zero dependencies. Usage: node scripts/check-hooks-order.mjs [dir ...]
// Exits 1 if any violation is found.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DEFAULT_DIRS = ['TaxiMobile/src', 'TaxiDashboard/src'];
const EXTS = ['.tsx', '.jsx'];

const HOOK = /=\s*(React\.)?use[A-Z]\w*\s*\(|^\s*(React\.)?use[A-Z]\w*\s*\(/;
const FUNC_START =
  /(export\s+)?(default\s+)?function\s+[A-Z]\w*\s*\(|(export\s+)?const\s+[A-Z]\w*\s*[:=][^=]*=>/;
const GUARD_RETURN =
  /^\s*if\s*\(.*\)\s*return\b|^\s*return\s+null\s*;?\s*$|^\s*return\s*</;

/** Walk a directory tree collecting component source files. */
function collect(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return; // dir doesn't exist — skip silently
  }
  for (const name of entries) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) collect(full, out);
    else if (EXTS.some((e) => name.endsWith(e))) out.push(full);
  }
}

/**
 * Scan one file. Returns [{ line, guardLine, text }] for each Hook called at a
 * component's top-level brace depth after a top-level early return.
 */
function scan(path) {
  const lines = readFileSync(path, 'utf8').split('\n');
  const n = lines.length;
  const hits = [];
  let i = 0;
  while (i < n) {
    const head = lines[i];
    if (FUNC_START.test(head) && (head.includes('function') || head.includes('=>'))) {
      let depth = 0;
      let started = false;
      let guardLine = null;
      let j = i;
      for (; j < n; j++) {
        const l = lines[j];
        if (started && depth === 1) {
          // Direct statement of the component body.
          if (guardLine === null && GUARD_RETURN.test(l)) {
            guardLine = j + 1;
          } else if (guardLine !== null && HOOK.test(l)) {
            hits.push({ line: j + 1, guardLine, text: l.trim().slice(0, 100) });
          }
        }
        depth += count(l, '{') - count(l, '}');
        if (!started && count(l, '{') > 0) started = true;
        if (started && depth <= 0) break;
      }
      i = j;
    }
    i++;
  }
  return hits;
}

function count(s, ch) {
  let c = 0;
  for (const x of s) if (x === ch) c++;
  return c;
}

const dirs = process.argv.slice(2);
const targets = dirs.length ? dirs : DEFAULT_DIRS;

const files = [];
for (const d of targets) collect(d, files);
files.sort();

let total = 0;
for (const f of files) {
  for (const hit of scan(f)) {
    total++;
    const rel = f.replace(/\\/g, '/');
    console.error(
      `${rel}:${hit.line}  Hook called after early return (guard at line ${hit.guardLine})\n` +
        `     ${hit.text}`
    );
  }
}

if (total > 0) {
  console.error(
    `\n✖ ${total} conditional-Hook violation(s) found. ` +
      `Move every Hook call above the early return so the Hook count stays ` +
      `constant across renders.\n` +
      `See scripts/check-hooks-order.mjs for details.`
  );
  process.exit(1);
}

console.log(`✓ No conditional-Hook violations in: ${targets.join(', ')}`);
