import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

let client;

// Both empty allows local development. A partial setup is a mistake.
export function supabaseConfigured() {
    const url = process.env.SUPABASE_URL?.trim();
    const key = process.env.SUPABASE_SECRET_KEY?.trim();

    if (Boolean(url) !== Boolean(key)) {
        throw new Error(
            'Set both SUPABASE_URL and SUPABASE_SECRET_KEY in .env, or leave both empty.'
        );
    }

    return Boolean(url && key);
}

export function getSupabase() {
    if (client) return client;

    const url = process.env.SUPABASE_URL?.trim();
    const key = process.env.SUPABASE_SECRET_KEY?.trim();

    if (!url || !key) {
        throw new Error(
            'Set SUPABASE_URL and SUPABASE_SECRET_KEY in .env.'
        );
    }

    client = createClient(url, key, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
        },
    });

    return client;
}