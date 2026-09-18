import { settings, authenticateWebhook, saveEvent, json, failure } from '@/lib/server';
import { validateEvent, readJson } from '@/lib/contracts.mjs';
export async function POST(r: Request, { params }: {
    params: Promise<{
        event: string;
    }>;
}) { try {
    const config = await settings();
    await authenticateWebhook(r, config);
    const { event } = await params;
    const payload = validateEvent(event, await readJson(r));
    return json({ received: true, ...await saveEvent(event, payload, 'live:' + config.baseUrl) });
}
catch (e) {
    return failure(e);
} }
