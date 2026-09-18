import { requireOwner, settings, json, failure } from '@/lib/server';
import { simulate } from '@/lib/demo';
import { ApiError, checkOrigin, readJson, EVENT_TYPES } from '@/lib/contracts.mjs';
export async function POST(r: Request) { try {
    await requireOwner();
    checkOrigin(r);
    if ((await settings()).mode !== 'demo')
        throw new ApiError(403, 'Simulation disponible uniquement en démo.');
    const v = await readJson(r);
    if (!EVENT_TYPES.includes(v.type) || typeof v.commercial_id !== 'string')
        throw new ApiError(422, 'Événement invalide.');
    return json(await simulate(v.type, v.commercial_id));
}
catch (e) {
    return failure(e);
} }
