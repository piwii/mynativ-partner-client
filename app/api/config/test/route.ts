import { requireOwner, settings, upstream, json, failure } from '@/lib/server';
import { checkOrigin, ApiError } from '@/lib/contracts.mjs';
export async function POST(r: Request) { try {
    await requireOwner();
    checkOrigin(r);
    const response = await upstream(await settings(), 'users');
    if (!response.ok)
        throw new ApiError(response.status, 'Connexion refusée par myNativ (HTTP ' + response.status + ').');
    return json({ success: true });
}
catch (e) {
    return failure(e);
} }
