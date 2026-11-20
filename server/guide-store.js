import { getSupabase } from './supabase.js';

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
        );

    if (error) {
        throw new Error(`Saving guide failed: ${error.message}`);
    }
}

export async function getProcessedGuide(id) {
    const { data, error } = await getSupabase()
        .from('processed_guides')
        .select('payload')
        .eq('id', id)
        .maybeSingle();

    if (error) {
        throw new Error(`Loading guide failed: ${error.message}`);
    }

    return data?.payload ?? null;
}