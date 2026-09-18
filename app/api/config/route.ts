import { settings, saveSettings, json, failure } from '@/lib/server';
import { ApiError, checkOrigin, readJson, safeBase } from '@/lib/contracts.mjs';
export async function GET() { try {
    const c = await settings();
    return json({ mode: c.mode, baseUrl: c.baseUrl, hasApiToken: !!c.apiToken, hasWebhookToken: !!c.webhookToken });
}
catch (e) {
    return failure(e);
} }
export async function PUT(r: Request) { try {
    checkOrigin(r);
    const v = await readJson(r);
    if (!['demo', 'live'].includes(v.mode))
        throw new ApiError(422, 'Mode invalide.');
    const old = await settings();
    for (const name of ['apiToken', 'webhookToken'])
        if (v[name] != null && (typeof v[name] !== 'string' || v[name].length > 12000))
            throw new ApiError(422, 'Jeton invalide.');
    const changedBase = old.baseUrl !== v.baseUrl;
    const c = { mode: v.mode, baseUrl: safeBase(v.baseUrl), apiToken: v.apiToken?.trim() || (changedBase ? undefined : old.apiToken), webhookToken: v.webhookToken?.trim() || old.webhookToken };
    if (c.mode === 'live' && !c.apiToken)
        throw new ApiError(422, 'Un jeton API est nécessaire pour activer la connexion réelle.');
    await saveSettings(c);
    return json({ saved: true });
}
catch (e) {
    return failure(e);
} }
