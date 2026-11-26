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