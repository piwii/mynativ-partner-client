import { settings, upstream, json, failure } from '@/lib/server';
import { demoRequest } from '@/lib/demo';
import { routeAllowed, ApiError, checkOrigin, readJson, validateAssignment, validateAbandon, validateMessage, uploadStream } from '@/lib/contracts.mjs';
async function handle(r: Request, { params }: {
    params: Promise<{
        path: string[];
    }>;
}) {
    try {
        const { path: parts } = await params;
        const path = parts.join('/');
        if (!routeAllowed(r.method, path))
            throw new ApiError(404, 'Route inconnue.');
        if (r.method !== 'GET')
            checkOrigin(r);
        const config = await settings();
        let data: Record<string, unknown> | FormData | undefined;
        let body: BodyInit | undefined;
        const headers: Record<string, string> = {};
        if ((r.method === 'PUT' && !path.endsWith('/toggle')) || (r.method === 'POST' && path.endsWith('/messages'))) {
            data = r.method === 'PUT' ? (path.endsWith('/abandon') ? validateAbandon(await readJson(r)) : validateAssignment(await readJson(r))) : validateMessage(await readJson(r));
            body = JSON.stringify(data);
            headers['Content-Type'] = 'application/json';
        }
        else if (r.method === 'POST') {
            const type = r.headers.get('content-type') ?? '';
            if (!type.startsWith('multipart/form-data;'))
                throw new ApiError(415, 'Un formulaire avec un PDF est nécessaire.');
            if (Number(r.headers.get('content-length')) > 32 * 1024 * 1024)
                throw new ApiError(413, 'PDF trop volumineux.');
            if (config.mode === 'demo') {
                const limited = new Request(r.url, { method: 'POST', headers: r.headers, body: uploadStream(r.body), duplex: 'half' } as RequestInit);
                data = await limited.formData();
            }
            else {
                body = uploadStream(r.body);
                headers['Content-Type'] = type;
            }
        }
        if (config.mode === 'demo')
            return json(await demoRequest(r.method, path, data));
        const query = new URL(r.url).searchParams;
        const qs = new URLSearchParams();
        if (r.method === 'GET' && path === 'travel-requests') {
            const page = Number(query.get('page') ?? 1);
            if (!Number.isSafeInteger(page) || page < 1)
                throw new ApiError(422, 'Page invalide.');
            qs.set('page', String(page));
            qs.set('per_page', '20');
            qs.set('sort', '-created_at');
        }
        const response = await upstream(config, path + (qs.size ? '?' + qs : ''), { method: r.method, headers, body });
        const text = await response.text();
        let result;
        try {
            result = JSON.parse(text);
        }
        catch {
            throw new ApiError(502, 'myNativ a renvoyé une réponse inattendue (HTTP ' + response.status + ').');
        }
        return json(result, response.status);
    }
    catch (e) {
        return failure(e);
    }
}
export const GET = handle;
export const PUT = handle;
export const POST = handle;
