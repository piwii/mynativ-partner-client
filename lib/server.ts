import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { ApiError, secureEqual, eventKey, eventReference } from './contracts.mjs';
import type { Settings } from './types';
type Runtime = {
    DB?: D1Database;
    ENCRYPTION_KEY?: string;
    ALLOWED_EMAILS?: string;
};
export const runtime = () => env as Runtime;
export function db() { const d = runtime().DB; if (!d)
    throw new ApiError(503, 'Le stockage est temporairement indisponible.'); return d; }
export async function requireOwner() { const user = await getChatGPTUser(); if (!user)
    throw new ApiError(401, 'Connectez-vous avec ChatGPT pour accéder à cet espace.'); const allow = (runtime().ALLOWED_EMAILS ?? '').split(',').map(x => x.trim().toLowerCase()); if (!allow.includes(user.email.toLowerCase()))
    throw new ApiError(403, 'Ce compte n’a pas accès à cet espace partenaire.'); return user; }
export function json(data: unknown, status = 200) { return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } }); }
export function failure(e: unknown) { if (e instanceof ApiError)
    return json({ message: e.message, errors: e.errors }, e.status); console.error('Partner Desk:', e instanceof Error ? e.name : 'UnknownError'); return json({ message: 'Le service est temporairement indisponible. Réessayez.' }, 503); }
async function key() { const hex = runtime().ENCRYPTION_KEY; if (!hex || !/^[a-f0-9]{64}$/.test(hex))
    throw new ApiError(503, 'Le chiffrement de la connexion n’est pas encore configuré.'); return crypto.subtle.importKey('raw', Uint8Array.from(hex.match(/../g)!, v => parseInt(v, 16)), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']); }
export async function encrypt(value: string) { const iv = crypto.getRandomValues(new Uint8Array(12)); const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(), new TextEncoder().encode(value)); return btoa(String.fromCharCode(...iv, ...new Uint8Array(encrypted))); }
export async function decrypt(value: string) { const bytes = Uint8Array.from(atob(value), c => c.charCodeAt(0)); return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, await key(), bytes.slice(12))); }
export async function settings(): Promise<Settings> { const row = await db().prepare('SELECT value FROM settings WHERE key = ?').bind('connection').first<{
    value: string;
}>(); return row ? JSON.parse(await decrypt(row.value)) : { mode: 'demo', baseUrl: 'https://preprod.mynativ.app' }; }
export async function saveSettings(value: Settings) { await db().prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind('connection', await encrypt(JSON.stringify(value))).run(); }
export async function authenticateWebhook(request: Request, config: Settings) { if (config.mode !== 'live' || !config.webhookToken)
    throw new ApiError(503, 'La réception des webhooks n’est pas activée.'); if (!await secureEqual(request.headers.get('x-token') ?? '', config.webhookToken))
    throw new ApiError(401, 'Jeton webhook invalide.'); }
export async function saveEvent(type: string, payload: Record<string, unknown>, source = 'live') { const id = await eventKey(type, payload); const ref = eventReference(type, payload); const r = await db().prepare('INSERT OR IGNORE INTO events(id,event_type,commercial_id,travel_id,payload,received_at,source) VALUES(?,?,?,?,?,?,?)').bind(source + ':' + id, type, ref.commercial_id, ref.travel_id, JSON.stringify(payload), new Date().toISOString(), source).run(); return { id: source + ':' + id, duplicate: r.meta.changes === 0 }; }
export async function upstream(config: Settings, path: string, init: RequestInit = {}) { if (!config.apiToken)
    throw new ApiError(409, 'Ajoutez votre jeton API dans Connexion.'); try {
    const response = await fetch(config.baseUrl + '/api/v1/connectors/' + path, { ...init, redirect: 'manual', headers: { Accept: 'application/json', Authorization: 'Bearer ' + config.apiToken, ...init.headers }, signal: AbortSignal.timeout(45000) });
    if (response.status >= 300 && response.status < 400)
        throw new ApiError(502, 'myNativ a renvoyé une redirection inattendue. Vérifiez l’adresse de connexion.');
    return response;
}
catch (e) {
    if (e instanceof ApiError)
        throw e;
    throw new ApiError(502, 'myNativ ne répond pas. Vérifiez la connexion et l’état du dossier avant de réessayer une action.');
} }
