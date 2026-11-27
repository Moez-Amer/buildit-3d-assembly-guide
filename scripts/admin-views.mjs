// Who in the team (admins) opened which person's private guide or manual, and when: one row per admin, guide, kind and day.
//   node scripts/admin-views.mjs            the newest 500 looks
//   node scripts/admin-views.mjs <guide id> the looks at one guide (to answer "who looked at my scan?")
import { adminViews } from '../server/db.js';

const rows = adminViews(process.argv[2] || null);
if (!rows.length) { console.log('No looks recorded.'); process.exit(0); }
console.table(rows.map(r => ({ when: r.first_at.slice(0, 16).replace('T', ' '), admin: r.admin, guide: r.guide_id, opened: r.what })));
