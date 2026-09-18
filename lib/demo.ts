import { db, saveEvent } from './server';
import { ApiError, unwrap } from './contracts.mjs';
import type { Travel } from './types';
export const demoAbandonReasons = [{ id: 1, label: 'Projet annulé' }, { id: 2, label: 'Budget insuffisant' }, { id: 3, label: 'Autre motif' }];
export const demoUsers = [{ id: 11, fullname: 'Léa Dubois', email: 'lea@example.test' }, { id: 12, fullname: 'Hugo Petit', email: 'hugo@example.test' }, { id: 13, fullname: 'Nora Moreau', email: 'nora@example.test' }];
export const demoTrips: Travel[] = [
    { id: 421, commercial_id: 'MAR2026-0421', user_id: null, status: 'NEW', main_traveler: { firstname: 'Camille', lastname: 'Laurent', email: 'camille@example.test' }, travel_detail: 'Nous aimerions découvrir Marrakech puis les montagnes de l’Atlas, avec quelques nuits dans un riad. Nous privilégions les petites adresses et les rencontres locales.', departure_date: '2026-10-18', pax_adults: 2, pax_kids: 0, budget: 4800, is_deposit_paid: false },
    { id: 186, commercial_id: 'JPN2026-0186', user_id: 11, status: 'QUOTATION_SENT', main_traveler: { firstname: 'Thomas', lastname: 'Martin', email: 'thomas@example.test' }, travel_detail: 'Un premier voyage au Japon, de Tokyo à Kyoto en passant par les Alpes japonaises.', departure_date: '2026-11-06', pax_adults: 2, pax_kids: 0, budget: 7200, is_deposit_paid: false },
    { id: 93, commercial_id: 'ZAF2026-0093', user_id: 12, status: 'REGISTERED', main_traveler: { firstname: 'Sarah', lastname: 'Bernard', email: 'sarah@example.test' }, travel_detail: 'Un safari en famille et quelques jours au Cap. Nous voyageons avec nos deux enfants.', departure_date: '2026-12-12', pax_adults: 2, pax_kids: 2, budget: 12400, is_deposit_paid: true }
];
async function add(kind: string, id: string, value: unknown) { await db().prepare('INSERT OR IGNORE INTO records(key,kind,data) VALUES(?,?,?)').bind('demo:' + kind + ':' + id, 'demo:' + kind, JSON.stringify(value)).run(); }
async function all(kind: string) { return (await db().prepare('SELECT data FROM records WHERE kind = ? ORDER BY key').bind('demo:' + kind).all<{
    data: string;
}>()).results.map(x => JSON.parse(x.data)); }
async function trip(id: string): Promise<Travel> { const row = await db().prepare('SELECT data FROM records WHERE key = ?').bind('demo:travel:' + id).first<{
    data: string;
}>(); if (!row)
    throw new ApiError(404, 'Dossier introuvable.'); return JSON.parse(row.data); }
export async function seed() { await db().batch(demoTrips.map(t => db().prepare('INSERT OR IGNORE INTO records(key,kind,data) VALUES(?,?,?)').bind('demo:travel:' + t.commercial_id, 'demo:travel', JSON.stringify(t)))); }
export async function demoRequest(method: string, path: string, body?: Record<string, unknown> | FormData) {
    await seed();
    if (path === 'statuses/abandoned/reasons') return { data: demoAbandonReasons };
    if (path === 'users')
        return { data: demoUsers };
    if (path === 'travel-requests')
        return { data: await all('travel'), meta: { current_page: 1, last_page: 1 } };
    const [, id, kind] = path.split('/');
    const t = await trip(id);
    if (!kind && method === 'GET')
        return { data: t };
    if (!kind && method === 'PUT') {
        const user_id = Number((body as Record<string, unknown>).user_id);
        if (!demoUsers.some(u => u.id === user_id))
            throw new ApiError(422, 'Conseiller inconnu.');
        await db().prepare("UPDATE records SET data=json_set(data,'$.user_id',?) WHERE key=?").bind(user_id, 'demo:travel:' + id).run();
        return { data: await trip(id) };
    }
    if (method === 'PUT' && kind === 'abandon') {
        const data = body as Record<string, unknown>;
        if (!demoAbandonReasons.some(r => r.id === data.reason_id)) throw new ApiError(422, 'Motif inconnu.');
        if (!['TO_DISPATCH', 'NEW', 'WAITING_TRAVELER', 'QUOTATION_TO_DO', 'QUOTATION_TO_DO_AGAIN', 'VALIDITY_DATE_EXPIRED', 'DEFERRED'].includes(t.status ?? '')) throw new ApiError(403, 'Ce dossier ne peut pas être abandonné.');
        await db().prepare('UPDATE records SET data=? WHERE key=?').bind(JSON.stringify({ ...t, status: 'ABANDONED', abandon: data }), 'demo:travel:' + id).run();
        return { data: await trip(id) };
    }
    if (method === 'PUT' && kind === 'quotations') {
        const quotationId = path.split('/')[3];
        const quotation = (await all('quotations')).find(q => String(q.id) === quotationId && q.travel_request_id === t.id);
        if (!quotation) throw new ApiError(404, 'Devis introuvable pour ce dossier.');
        quotation.active = !quotation.active;
        await db().prepare('UPDATE records SET data=? WHERE key=?').bind(JSON.stringify(quotation), 'demo:quotations:' + quotationId).run();
        return { data: quotation };
    }
    if (method === 'GET')
        return { data: (await all(kind)).filter(x => x.travel_request_id === t.id) };
    let value: Record<string, unknown> = { id: crypto.randomUUID(), travel_request_id: t.id, created_at: new Date().toISOString() };
    if (kind === 'messages') {
        value = { ...value, ...body as Record<string, unknown> };
    }
    else {
        const f = body as FormData;
        const pdf = f.get('quotation');
        if (!(pdf instanceof File) || pdf.size === 0 || pdf.size > 30 * 1024 * 1024 || !pdf.name.toLowerCase().endsWith('.pdf') || new TextDecoder().decode(await pdf.slice(0, 5).arrayBuffer()) !== '%PDF-')
            throw new ApiError(422, 'Ajoutez un PDF valide de 30 Mo maximum.');
        for (const [k, v] of f.entries())
            if (typeof v === 'string')
                value[k] = v;
        const price = Number(value.price ?? value.price_local);
        if (!Number.isFinite(price) || price < 1 || price > 1000000)
            throw new ApiError(422, 'Prix invalide.');
        if (!/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(String(value.expiration_date)))
            throw new ApiError(422, 'Date d’expiration invalide.');
        if (kind === 'quotations') {
            if (!value.travel_name || String(value.travel_name).length > 80 || !Number.isInteger(Number(value.pax_adults)) || !Number.isInteger(Number(value.pax_kids)) || Number(value.pax_adults) < 1 || Number(value.pax_adults) > 100 || Number(value.pax_kids) < 0 || Number(value.pax_kids) > 100 || !/^\d{4}-\d{2}-\d{2}$/.test(String(value.departure_date)) || !/^\d{4}-\d{2}-\d{2}$/.test(String(value.return_date)) || String(value.return_date) <= String(value.departure_date))
                throw new ApiError(422, 'Vérifiez le nom, les dates et les voyageurs.');
            value.active = true;
            value.price = price;
            value.is_visible = true;
        }
        else {
            if (!['modification', 'travel_request'].includes(String(value.price_mode)) || String(value.message ?? '').length < 3 || String(value.message).length > 100)
                throw new ApiError(422, 'Proposition invalide.');
            value.status = 'PENDING';
            value.price = price;
        }
        value.file_name = pdf.name;
    }
    await add(kind, String(value.id), value);
    return { data: value };
}
export async function simulate(type: string, id: string) {
    await seed();
    let t = await trip(id);
    let payload: Record<string, unknown>;
    if (type === 'new-request') {
        const n = Date.now();
        t = { ...demoTrips[0], id: n, commercial_id: 'DEMO-' + n, main_traveler: { firstname: 'Alex', lastname: 'Voyageur', email: 'alex@example.test' }, created_at: new Date().toISOString() };
        await add('travel', t.commercial_id, t);
        payload = { ...t };
    }
    else if (type === 'payment') {
        payload = { id: Date.now(), amount: 1200, paid_at: new Date().toISOString(), is_first_payment: true, travel_request: { id: t.id, commercial_id: t.commercial_id } };
        await db().prepare("UPDATE records SET data=json_set(data,'$.is_deposit_paid',json('true')) WHERE key=?").bind('demo:travel:' + id).run();
    }
    else if (type === 'message') {
        const r = await demoRequest('POST', 'travel-requests/' + id + '/messages', { message: 'Bonjour, merci pour votre proposition ! Pourrions-nous ajouter une nuit sur place ?' });
        payload = unwrap(r);
    }
    else {
        const propositions = (await all('propositions')).filter(p => p.travel_request_id === t.id).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
        if (!propositions.length)
            throw new ApiError(409, 'Créez d’abord une proposition de modification sur ce dossier.');
        const p = propositions.at(-1);
        payload = { ...p, status: 'VALIDATED', travel_request: { id: t.id, commercial_id: t.commercial_id } };
        await db().prepare("UPDATE records SET data=json_set(data,'$.status','VALIDATED') WHERE key=?").bind('demo:propositions:' + p.id).run();
    }
    return saveEvent(type, payload, 'demo');
}
