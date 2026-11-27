import { getSupabase } from './supabase.js';

const TIMEOUT_MS = 15000;

export async function saveProcessedGuide(
    guide,
    { ownerId = null, isPublic = false } = {}
) {
    if (
        !guide ||
        typeof guide.id !== 'string' ||
        !guide.id.trim() ||
        typeof guide.product !== 'string' ||
        !Array.isArray(guide.steps)
    ) {
        throw new Error(
            'Expected a guide with id, product, and a steps array.'
        );
    }

    const { error } = await getSupabase()
        .from('processed_guides')
        .upsert(
            {
                id: guide.id,
                owner_id: ownerId,
                product: guide.product,
                step_count: guide.steps.length,
                created_at: guide.created ?? new Date().toISOString(),
                is_public: isPublic,
                payload: guide,
            },
            { onConflict: 'id' }
        )
        .abortSignal(AbortSignal.timeout(TIMEOUT_MS));

    if (error) {
        throw new Error(`Saving guide failed: ${error.message}`);
    }
}

// a guide deleted here (by its owner, or with the account) is deleted in Supabase too
export async function deleteProcessedGuide(id) {
    const { error } = await getSupabase()
        .from('processed_guides')
        .delete()
        .eq('id', id)
        .abortSignal(AbortSignal.timeout(TIMEOUT_MS));

    if (error) {
        throw new Error(`Deleting guide failed: ${error.message}`);
    }
}

// a guide put into or taken out of the library (scripts/library.mjs)
export async function setProcessedGuidePublic(id, isPublic) {
    const { error } = await getSupabase()
        .from('processed_guides')
        .update({ is_public: isPublic })
        .eq('id', id)
        .abortSignal(AbortSignal.timeout(TIMEOUT_MS));

    if (error) {
        throw new Error(`Updating guide failed: ${error.message}`);
    }
}

export async function getProcessedGuide(id) {
    const { data, error } = await getSupabase()
        .from('processed_guides')
        .select('payload')
        .eq('id', id)
        .maybeSingle()
        .abortSignal(AbortSignal.timeout(TIMEOUT_MS));

    if (error) {
        throw new Error(`Loading guide failed: ${error.message}`);
    }

    return data?.payload ?? null;
}