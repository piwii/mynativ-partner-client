import { settings, db, json, failure } from '@/lib/server';
export async function GET() { try {
    const c = await settings();
    const data = await db().prepare('SELECT * FROM events WHERE source = ? ORDER BY received_at DESC LIMIT 100').bind(c.mode === 'live' ? 'live:' + c.baseUrl : 'demo').all();
    return json({ data: data.results });
}
catch (e) {
    return failure(e);
} }
