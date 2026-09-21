import { unwrap } from './contracts.mjs';

/**
 * @param {(url: string) => Promise<any>} request
 * @param {(ms: number) => Promise<void>} wait
 * @param {{onProgress?: (items: any[], page: number, lastPage: number) => void, onWait?: (ms: number) => void}} callbacks
 */
export async function loadAllRequests(request, wait = ms => new Promise(resolve => setTimeout(resolve, ms)), callbacks = {}) {
    const items = new Map();
    let lastPage = 1;
    for (let page = 1; page <= lastPage; page++) {
        // Leave room within the upstream 60 requests/minute limit for dossier actions.
        if (page > 1) await wait(1500);
        let response;
        try {
            response = await request('/api/partner/travel-requests?page=' + page);
        } catch (error) {
            if (error.status !== 429) throw error;
            callbacks.onWait?.(error.retryAfterMs ?? 60000);
            await wait(error.retryAfterMs ?? 60000);
            response = await request('/api/partner/travel-requests?page=' + page);
        }
        const batch = unwrap(response);
        if (!Array.isArray(batch)) throw new Error('Format de liste myNativ inattendu.');
        const last = Number(response.meta?.last_page ?? 1);
        if (!Number.isSafeInteger(last) || last < page) throw new Error('Pagination myNativ inattendue.');
        lastPage = last;
        for (const item of batch) items.set(item.commercial_id, item);
        callbacks.onProgress?.([...items.values()], page, lastPage);
    }
    return [...items.values()];
}
