// Ratings in Supabase (table guide_ratings, supabase/migrations/20261127000100_create_guide_ratings.sql): a copy of the
// ratings table in server/data/buildit.db, so the team can see all ratings together. The local database stays the record.
import { getSupabase } from './supabase.js';

const TIMEOUT_MS = 15000;

export async function saveRatingCloud(r) {
    const { error } = await getSupabase()
        .from('guide_ratings')
        .upsert(
            {
                guide_id: r.guide_id,
                user_id: r.user_id,
                stars: r.stars,
                comment: r.comment,
                product: r.product,
                company: r.company,
                created_at: r.created,
                updated_at: r.updated,
            },
            { onConflict: 'guide_id,user_id' }
        )
        .abortSignal(AbortSignal.timeout(TIMEOUT_MS));

    if (error) {
        throw new Error(`Saving rating failed: ${error.message}`);
    }
}

/** Deletes the ratings of one guide ({ guideId }) or of one person ({ userId }). */
export async function deleteRatingsCloud({ guideId, userId }) {
    const [column, value] = guideId ? ['guide_id', guideId] : ['user_id', userId];
    if (!value) throw new Error('Name a guide or a person.');

    const { error } = await getSupabase()
        .from('guide_ratings')
        .delete()
        .eq(column, value)
        .abortSignal(AbortSignal.timeout(TIMEOUT_MS));

    if (error) {
        throw new Error(`Deleting ratings failed: ${error.message}`);
    }
}
