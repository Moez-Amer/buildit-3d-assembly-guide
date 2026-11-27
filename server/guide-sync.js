// Store completed guides in Supabase using existing local ownership.
import { guideRow } from './db.js';
import { supabaseConfigured } from './supabase.js';
import { saveProcessedGuide } from './guide-store.js';

export async function syncGuide(guide) {
    const row = guideRow(guide.id);

    if (!row) {
        throw new Error(
            'Cannot sync a guide without a local ownership record.'
        );
    }

    if (!supabaseConfigured()) return false;

    await saveProcessedGuide(guide, {
        ownerId: row.owner,
        isPublic: row.public === 1,
    });

    return true;
}

/**
 * Runs one Supabase write in the background, when Supabase is set up. Nobody waits for it: the local database is the
 * record, so a slow or failed cloud write is only logged, never shown to the person.
 */
export function mirror(label, write) {
    if (!supabaseConfigured()) return;
    write().then(
        () => console.log(`supabase: ${label}`),
        e => console.warn(`supabase: ${label} failed: ${e.message}`)
    );
}
