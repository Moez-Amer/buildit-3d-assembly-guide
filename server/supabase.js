import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

let client;

export function getSupabase() {
    if (client) return client;

    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;

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