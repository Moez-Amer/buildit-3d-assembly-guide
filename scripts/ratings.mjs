// All ratings combined, from server/data/buildit.db (the same numbers as GET /api/ratings for admins).
//   node scripts/ratings.mjs              one row per guide: ratings, average, stars, comments
//   node scripts/ratings.mjs --comments   and the newest comments (who wrote them is not shown)
// In any SQLite tool: SELECT * FROM rating_summary. In Supabase: the guide_rating_summary view.
import { ratingSummary, ratingComments } from '../server/db.js';

const rows = ratingSummary();
if (!rows.length) { console.log('No ratings yet.'); process.exit(0); }

const name = r => [r.company, r.product].filter(Boolean).join(' · ') || r.guide_id;
const all = rows.reduce((n, r) => n + r.ratings, 0);
const avg = rows.reduce((n, r) => n + r.average * r.ratings, 0) / all;
console.log(`${all} rating${all === 1 ? '' : 's'} of ${rows.length} guide${rows.length === 1 ? '' : 's'}, average ${avg.toFixed(2)} of 5\n`);
console.table(rows.map(r => ({ guide: r.guide_id, name: name(r).slice(0, 48), ratings: r.ratings, average: r.average,
  '5★': r.five, '4★': r.four, '3★': r.three, '2★': r.two, '1★': r.one, comments: r.comments, last: r.last_rated.slice(0, 10) })));

if (process.argv.includes('--comments')) {
  console.log('\nNewest comments:');
  for (const c of ratingComments(50)) console.log(`\n${'★'.repeat(c.stars)}${'☆'.repeat(5 - c.stars)}  ${name(c)}  (${c.updated.slice(0, 10)})\n  ${c.comment.replace(/\n/g, '\n  ')}`);
}
