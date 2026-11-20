import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
    saveProcessedGuide,
    getProcessedGuide,
} from '../server/guide-store.js';

const filename =
    process.argv[2] ??
    new URL(
        '../web/public/examples/bookcase.json',
        import.meta.url
    );

const guide = JSON.parse(await readFile(filename, 'utf8'));

await saveProcessedGuide(guide);

const restored = await getProcessedGuide(guide.id);

// Compare the complete JSON structure after retrieving it.
assert.deepStrictEqual(restored, guide);

console.log('Supabase round trip succeeded:', {
    id: restored.id,
    product: restored.product,
    steps: restored.steps.length,
});