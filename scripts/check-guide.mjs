// Check a guide file for geometry and count problems.
// Run: node scripts/check-guide.mjs web/public/examples/bookcase.json [more.json ...]
import { readFileSync } from 'node:fs';
import { normalizeGuide } from '../web/src/guide.js';
import { checkGuide } from '../web/src/check.js';

let bad = 0;
for (const file of process.argv.slice(2)) {
  const issues = checkGuide(normalizeGuide(JSON.parse(readFileSync(file, 'utf8'))));
  console.log(`\n${file}: ${issues.length ? '' : 'no problems found'}`);
  for (const i of issues) console.log(`  ${i.level.padEnd(5)} ${i.step ? `step ${i.step}` : 'guide '.padEnd(6)}  ${i.code.padEnd(14)} ${i.msg}${i.count > 1 ? ` (×${i.count})` : ''}`);
  bad += issues.filter(i => i.level === 'error').length;
}
process.exit(bad ? 1 : 0);
