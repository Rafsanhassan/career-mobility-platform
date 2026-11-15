/**
 * Prints the ranked recommendations for the sample profile from the brief.
 * Usage: npm run demo            (summary table)
 *        npm run demo -- opp-003 (full explanation for one opportunity)
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rankOpportunities } from '../src/matching/matcher.js';
import { loadOpportunities } from '../src/data/opportunityRepository.js';
import { profileSchema } from '../src/validation/schemas.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const profile = profileSchema.parse(JSON.parse(readFileSync(join(root, 'data/sample-profile.json'), 'utf8')));
const ranked = rankOpportunities(profile, loadOpportunities(join(root, 'data/opportunities.json')));
const focus = process.argv[2];

if (focus) {
  const r = ranked.find((x) => x.opportunity.id === focus);
  if (!r) {
    console.error(`No opportunity with id ${focus}`);
    process.exit(1);
  }
  console.log(`#${r.rank} ${r.opportunity.title} - ${r.opportunity.organisation}`);
  console.log(r.match.summary, '\n');
  for (const c of r.match.breakdown) {
    console.log(c.applicable ? `${c.label}: ${c.points}/${c.maxPoints}` : `${c.label}: not scored (${c.note})`);
    c.strengths.forEach((s) => console.log(`  + ${s}`));
    c.gaps.forEach((s) => console.log(`  - ${s}`));
  }
  console.log('\nFlags:');
  r.match.flags.forEach((f) => console.log(`  [${f.severity}] ${f.message}`));
} else {
  console.log('Rank | Score | Label                    | Eligibility | Opportunity');
  console.log('-----|-------|--------------------------|-------------|------------');
  for (const r of ranked) {
    console.log(
      `${String(r.rank).padStart(4)} | ${String(r.match.score).padStart(5)} | ${r.match.labelText.padEnd(24)} | ${r.match.eligibility.padEnd(11)} | ${r.opportunity.title} (${r.opportunity.id})`,
    );
  }
}
