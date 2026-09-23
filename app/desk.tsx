"use client";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowUpRight, BriefcaseBusiness, RefreshCw, Settings2, Waypoints, Plus, MessageSquare, FileText, UserRound, CalendarDays, ChevronRight, Check, Copy, LockKeyhole, Send, CircleAlert, Upload, CreditCard, FlaskConical, ExternalLink } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Empty as EmptyContainer, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogHeader } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import type { Travel, User, Quotation, Message, MessageTemplate, Event, ConfigView } from '@/lib/types';
import { unwrap } from '@/lib/contracts.mjs';
import { loadAllRequests } from '@/lib/request-list.mjs';
const eventLabels: Record<string, string> = { 'new-request': 'Nouvelle demande', 'payment': 'Paiement reçu', 'proposition': 'Proposition mise à jour', 'message': 'Nouveau message' };
const statusLabels: Record<string, string> = {
    TO_DISPATCH: 'À attribuer',
    NEW: 'Nouvelle demande',
    WAITING_TRAVELER: 'En attente du voyageur',
    QUOTATION_TO_DO: 'Devis à faire',
    RELAUNCH_TRAVELER: 'Voyageur à relancer',
    VALIDITY_DATE_EXPIRED: 'Date de validité expirée',
    ABANDONED: 'Abandonné',
    DEFERRED: 'Reporté',
    WAITING_PAYMENTS: 'En attente de paiement',
    MODIFICATION_IN_PROGRESS: 'Modification en cours',
    TO_SOLD: 'À solder',
    DEPARTURE: 'Départ à venir',
    QUOTATION_TO_DO_AGAIN: 'Devis à refaire',
    TRAVELING: 'Voyage en cours',
    TERMINATED: 'Terminé',
    CANCELLATION_REQUEST: 'Demande d’annulation',
    CANCELED: 'Annulé',
    POSTPONED: 'Voyage reporté',
    QUOTATION_SENT: 'Devis envoyé',
    REGISTERED: 'Inscrit',
    VALIDATED: 'Validée',
    PENDING: 'En attente',
    REFUSED: 'Refusée',
};
const dates = (s?: string) => { if (!s)
    return 'Non renseigné'; const d = new Date(s.replace(' ', 'T')); return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString('fr-FR'); };
const euros = (n?: number) => n == null ? 'Non renseigné' : new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Number(n));
const person = (t: Travel) => [t.main_traveler?.firstname, t.main_traveler?.lastname].filter(Boolean).join(' ') || t.commercial_id;
const pathOf = (id: string, suffix = '') => '/api/partner/travel-requests/' + encodeURIComponent(id) + suffix;
class HttpError extends Error {
    constructor(public status: number, message: string, public retryAfterMs = 60000) { super(message); }
}
async function request(url: string, options: RequestInit = {}) { const r = await fetch(url, { ...options, cache: 'no-store' }); let value; try {
    value = await r.json();
}
catch {
    throw new Error('Réponse inattendue du serveur.');
} if (!r.ok) {
    const fields = value.errors ? Object.values(value.errors).flat().join(' ') : '';
    const retry = r.headers.get('Retry-After');
    const retryMs = retry && /^\d+$/.test(retry) ? Number(retry) * 1000 : retry ? Date.parse(retry) - Date.now() : 60000;
    throw new HttpError(r.status, r.status === 429 ? 'myNativ reçoit trop de requêtes. Veuillez réessayer dans une minute.' : fields || value.message || 'La requête a échoué.', Number.isFinite(retryMs) ? Math.max(1000, retryMs) : 60000);
} return value; }
const jsonBody = (value: unknown, method = 'POST') => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
function Empty({ icon = <FileText />, title, children }: {
    icon?: ReactNode;
    title: string;
    children?: ReactNode;
}) { return <EmptyContainer className="empty-state"><EmptyHeader><EmptyMedia>{icon}</EmptyMedia><EmptyTitle>{title}</EmptyTitle><EmptyDescription>{children}</EmptyDescription></EmptyHeader></EmptyContainer>; }
function Field({ label, children }: {
    label: string;
    children: ReactNode;
}) { return <label className="field"><span>{label}</span>{children}</label>; }
function Choice({ label, name, value, onChange, items }: {
    label: string;
    name?: string;
    value?: string;
    onChange?: (v: string) => void;
    items: {
        value: string;
        label: string;
    }[];
}) { return <div className="field"><span id={'label-' + name}>{label}</span><Select name={name} value={value} onValueChange={onChange} required><SelectTrigger aria-labelledby={'label-' + name} className="w-full"><SelectValue placeholder="Sélectionner"/></SelectTrigger><SelectContent>{items.map(x => <SelectItem key={x.value} value={x.value}>{x.label}</SelectItem>)}</SelectContent></Select></div>; }
function PlainMessage({ message }: {
    message: Message;
}) { const raw = String(message.message ?? message.content ?? message.body ?? ''); return <p className="message-text">{raw.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]*>/g, '')}</p>; }
function templateText(value: string | Record<string, string> | undefined) {
    if (typeof value === 'string') return value;
    return value?.fr || Object.values(value ?? {}).find(text => typeof text === 'string' && text.trim()) || '';
}
export default function Desk() {
    const [config, setConfig] = useState<ConfigView | null>(null), [session, setSession] = useState<'loading' | 'ready' | 'error'>('loading');
    const [trips, setTrips] = useState<Travel[]>([]), [users, setUsers] = useState<User[]>([]), [selected, setSelected] = useState(''), [trip, setTrip] = useState<Travel | null>(null), [quotes, setQuotes] = useState<Quotation[]>([]), [messages, setMessages] = useState<Message[]>([]), [events, setEvents] = useState<Event[]>([]);
    const [tab, setTab] = useState('overview'), [modal, setModal] = useState(''), [busy, setBusy] = useState(false), [loading, setLoading] = useState(false), [detailLoading, setDetailLoading] = useState(false), [error, setError] = useState(''), [formError, setFormError] = useState(''), [resourceErrors, setResourceErrors] = useState<Record<string, string>>({});
    const [mode, setMode] = useState('demo'), [base, setBase] = useState('https://preprod.mynativ.app'), [priceMode, setPriceMode] = useState('modification'), [consultant, setConsultant] = useState(''), [draft, setDraft] = useState(''), [eventType, setEventType] = useState('new-request');
    const [reasons, setReasons] = useState<{ id: number; label: string }[]>([]), [reason, setReason] = useState(''), [reasonsLoading, setReasonsLoading] = useState(false);
    const [templates, setTemplates] = useState<MessageTemplate[]>([]), [template, setTemplate] = useState(''), [templatesLoading, setTemplatesLoading] = useState(false), [templatesError, setTemplatesError] = useState(''), [templatesRetry, setTemplatesRetry] = useState(0);
    const serial = useRef(0), eventHead = useRef(''), selectedRef = useRef('');
    selectedRef.current = selected;
    const notifyError = (e: unknown) => { const text = e instanceof Error ? e.message : 'Une erreur est survenue.'; toast.error(text); return text; };
    async function loadConfig() { const c = await request('/api/config'); setConfig(c); setMode(c.mode); setBase(c.baseUrl); setSession('ready'); return c; }
    const listFlight = useRef<Promise<void> | null>(null);
    const [listProgress, setListProgress] = useState('');
    async function loadList() {
        if (listFlight.current) return listFlight.current;
        setLoading(true);
        setListProgress('Chargement des demandes…');
        const pending = fetchList();
        listFlight.current = pending;
        try { await pending; setListProgress(''); }
        catch (e) { setListProgress('Chargement incomplet. Les dossiers déjà affichés restent consultables. Cliquez sur Actualiser pour réessayer.'); throw e; }
        finally { if (listFlight.current === pending) { listFlight.current = null; setLoading(false); } }
    }
    async function fetchList() { const results = await Promise.allSettled([loadAllRequests(request, undefined, {
        onProgress: (items: Travel[], page: number, lastPage: number) => {
            // Preserve existing dossiers while refreshing; reconcile removals only on completion.
            setTrips(previous => [...new Map([...previous, ...items].map(item => [item.commercial_id, item])).values()]);
            setSelected(previous => previous || items[0]?.commercial_id || '');
            setListProgress(`${items.length} demandes chargées · ${page} / ${lastPage} lots reçus`);
        },
        onWait: (ms: number) => setListProgress(`Limite temporaire de myNativ : reprise automatique dans ${Math.ceil(ms / 1000)} secondes. Les dossiers chargés restent consultables.`),
    }), request('/api/partner/users').then(value => {
        const items = unwrap(value);
        setUsers(Array.isArray(items) ? items : []);
        return value;
    })]); if (results[0].status === 'rejected')
        throw results[0].reason; const items: Travel[] = results[0].value;
        setTrips(items); setSelected(prev => items.some(t => t.commercial_id === prev) ? prev : items[0]?.commercial_id ?? ''); if (results[1].status === 'fulfilled') {
        const u = unwrap(results[1].value);
        setUsers(Array.isArray(u) ? u : []);
    }
    else {
        setUsers([]);
        toast.error('Liste des conseillers indisponible. Actualisez pour réessayer.');
    } }
    async function loadDetail(id: string) { const n = ++serial.current; if (!id) {
        setTrip(null);
        return;
    } setDetailLoading(true); setResourceErrors({}); const result = await Promise.allSettled([request(pathOf(id)), request(pathOf(id, '/quotations')), request(pathOf(id, '/messages'))]); if (n !== serial.current)
        return; const errs: Record<string, string> = {}; if (result[0].status === 'fulfilled')
        setTrip(unwrap(result[0].value));
    else {
        setTrip(null);
        errs.detail = result[0].reason.message;
    } if (result[1].status === 'fulfilled')
        setQuotes(unwrap(result[1].value));
    else {
        setQuotes([]);
        errs.quotes = result[1].reason.message;
    } if (result[2].status === 'fulfilled')
        setMessages(unwrap(result[2].value));
    else {
        setMessages([]);
        errs.messages = result[2].reason.message;
    } setResourceErrors(errs); setDetailLoading(false); }
    async function loadEvents() { const v = await request('/api/events'); setEvents(v.data); return v.data as Event[]; }
    async function refresh() { setLoading(true); setError(''); try {
        await loadList();
        await loadEvents();
        if (selectedRef.current)
            await loadDetail(selectedRef.current);
    }
    catch (e) {
        setError(notifyError(e));
    }
    finally {
        setLoading(false);
    } }
    useEffect(() => { let active = true; (async () => { try {
        await loadConfig();
        if (!active)
            return;
        try { await loadList(); await loadEvents(); }
        catch (e) { if (active) setError(e instanceof Error ? e.message : 'Chargement indisponible.'); }
    }
    catch (e) {
        if (!active)
            return;
        setSession('error');
        setError(e instanceof Error ? e.message : 'Connexion indisponible.');
    } })(); return () => { active = false; }; }, []);
    useEffect(() => { if (session === 'ready')
        void loadDetail(selected); setDraft(''); setTemplate(''); }, [selected, session]);
    useEffect(() => {
        if (session !== 'ready' || tab !== 'messages') return;
        let active = true;
        setTemplates([]); setTemplate(''); setTemplatesLoading(true); setTemplatesError('');
        request('/api/partner/messages/templates').then(value => {
            const items = unwrap(value);
            if (!Array.isArray(items) || items.some(item => !item || item.id == null || !item.content || typeof item.content !== 'string' && typeof item.content !== 'object')) throw new Error('Format des modèles myNativ inattendu.');
            if (active) setTemplates(items);
        }).catch(e => { if (active) setTemplatesError(e instanceof Error ? e.message : 'Modèles indisponibles.'); })
            .finally(() => { if (active) setTemplatesLoading(false); });
        return () => { active = false; };
    }, [session, tab, config?.mode, config?.baseUrl, templatesRetry]);
    useEffect(() => { if (trip)
        setConsultant(trip.user_id ? String(trip.user_id) : ''); }, [trip?.commercial_id, trip?.user_id]);
    useEffect(() => { if (session !== 'ready')
        return; const timer = setInterval(async () => { if (document.hidden || listFlight.current)
        return; try {
        const list = await loadEvents();
        const head = list[0]?.id ?? '';
        if (head !== eventHead.current) {
            await loadList();
            if (selectedRef.current)
                await loadDetail(selectedRef.current);
        }
        eventHead.current = head;
        setResourceErrors(v => { const n = { ...v }; delete n.events; return n; });
    }
    catch {
        setResourceErrors(v => ({ ...v, events: 'Actualisation des événements interrompue. Cliquez sur Actualiser.' }));
    } }, 15000); return () => clearInterval(timer); }, [session, config?.mode]);
    useEffect(() => { const context = (document as unknown as {
        modelContext?: {
            registerTool: (tool: unknown, options: unknown) => Promise<void> | void;
        };
    }).modelContext; if (!context)
        return; const life = new AbortController(); try {
        Promise.resolve(context.registerTool({ name: 'list_partner_travel_requests', title: 'Lire les dossiers affichés', description: 'Retourne les dossiers regroupés par statut dans Partner Desk, sans modifier myNativ.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: true }, execute: async (input: Record<string, unknown>) => { if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length)
                throw new Error('Cette action n’accepte aucun paramètre.'); return { mode: config?.mode, dossiers: trips.map(t => ({ commercial_id: t.commercial_id, voyageur: person(t), status: t.status, user_id: t.user_id })) }; } }, { signal: life.signal })).catch(() => { });
    }
    catch { } return () => life.abort(); }, [trips, config?.mode]);
    async function openAbandon() {
        open('abandon'); setReason(''); setReasons([]); setReasonsLoading(true);
        try {
            const data = unwrap(await request('/api/partner/statuses/abandoned/reasons'));
            if (!Array.isArray(data)) throw new Error('Format des motifs inattendu.');
            setReasons(data);
            if (!data.length) setFormError('Aucun motif disponible.');
        } catch (e) { setFormError(notifyError(e)); }
        finally { setReasonsLoading(false); }
    }
    async function toggleQuotation(q: Quotation) {
        if (busy || !trip) return;
        const id = trip.commercial_id;
        setBusy(true);
        try {
            await request(pathOf(id, '/quotations/' + encodeURIComponent(q.id) + '/toggle'), { method: 'PUT' });
            toast.success('État du devis mis à jour.');
            if (selectedRef.current === id) await loadDetail(id);
        } catch (e) { notifyError(e); }
        finally { setBusy(false); }
    }
    function open(name: string) { setFormError(''); setModal(name); }
    async function submitAction(e: FormEvent<HTMLFormElement>) { e.preventDefault(); if (busy || !trip)
        return; setBusy(true); setFormError(''); const id = trip.commercial_id; try {
        const f = new FormData(e.currentTarget);
        if (modal === 'assign') {
            await request(pathOf(id), jsonBody({ user_id: Number(f.get('user_id')) }, 'PUT'));
        }
        else if (modal === 'abandon') {
            await request(pathOf(id, '/abandon'), jsonBody({ reason_id: Number(reason), reason_description: f.get('reason_description') }, 'PUT'));
        }
        else {
            const pdf = f.get('quotation');
            if (!(pdf instanceof File) || !pdf.size || pdf.size > 30 * 1024 * 1024)
                throw new Error('Ajoutez un PDF de 30 Mo maximum.');
            const exp = String(f.get('expiration_date')).replace('T', ' ');
            f.set('expiration_date', exp.length === 16 ? exp + ':00' : exp);
            await request(pathOf(id, modal === 'quote' ? '/quotations' : '/propositions'), { method: 'POST', body: f });
        }
        setModal('');
        toast.success(config?.mode === 'demo' ? 'Action enregistrée dans la démo.' : 'Action transmise à myNativ.');
        await loadDetail(id);
        await loadList();
    }
    catch (e) {
        setFormError(notifyError(e));
    }
    finally {
        setBusy(false);
    } }
    async function sendMessage(e: FormEvent) { e.preventDefault(); if (busy || !trip)
        return; setBusy(true); setFormError(''); try {
        await request(pathOf(trip.commercial_id, '/messages'), jsonBody({ message: draft, consultant_id: Number(consultant) }));
        setDraft(''); setTemplate('');
        toast.success(config?.mode === 'demo' ? 'Message ajouté à la démo.' : 'Message envoyé.');
        await loadDetail(trip.commercial_id);
    }
    catch (e) {
        setFormError(notifyError(e));
    }
    finally {
        setBusy(false);
    } }
    async function saveConfig(e: FormEvent<HTMLFormElement>) { e.preventDefault(); setBusy(true); setFormError(''); try {
        const f = new FormData(e.currentTarget);
        await request('/api/config', jsonBody({ mode, baseUrl: base, apiToken: f.get('apiToken'), webhookToken: f.get('webhookToken') }, 'PUT'));
        await loadConfig();
        setTrips([]);
        setTrip(null);
        setSelected('');
        setEvents([]);
        setQuotes([]);
        setMessages([]);
        setModal('');
        toast.success('Connexion enregistrée.');
        await loadList();
        await loadEvents();
    }
    catch (e) {
        setFormError(notifyError(e));
    }
    finally {
        setBusy(false);
    } }
    async function simulate() { if (!trip)
        return; setBusy(true); try {
        await request('/api/demo/event', jsonBody({ type: eventType, commercial_id: trip.commercial_id }));
        toast.success('Événement de démonstration reçu.');
        await refresh();
    }
    catch (e) {
        notifyError(e);
    }
    finally {
        setBusy(false);
    } }
    const grouped = new Map<string, Travel[]>();
    for (const item of trips) {
        const status = item.status || '';
        if (!grouped.has(status)) grouped.set(status, []);
        grouped.get(status)!.push(item);
    }
    const statusOrder = Object.keys(statusLabels);
    const groups = [...grouped.entries()].sort(([a], [b]) => {
        const rank = (status: string) => statusOrder.includes(status) ? statusOrder.indexOf(status) : statusOrder.length;
        return rank(a) - rank(b) || a.localeCompare(b);
    });
    const related = events.filter(e => e.commercial_id === trip?.commercial_id || (e.travel_id != null && Number(e.travel_id) === trip?.id));
    const unpaid = trip?.is_deposit_paid;
    const user = users.find(u => u.id === trip?.user_id);
    const hasAdvisor = Boolean(trip?.user_id);
    const accessibleTab = !hasAdvisor && (tab === 'quotes' || tab === 'messages') ? 'overview' : tab;
    return <main className="desk"><Toaster richColors position="bottom-right"/><header className="topbar"><a className="brand" href="/"><span className="mark"><Waypoints size={23}/></span><strong>myNativ<span>Partner Desk</span></strong></a><span className="workspace">ESPACE PARTENAIRE</span>{session === 'ready' && <Button variant="outline" onClick={() => open('settings')}><Settings2 /> Connexion</Button>}</header>
 {session !== 'ready' ? <div className="access-panel"><Waypoints size={32}/><h1>{session === 'loading' ? 'Ouverture de votre espace…' : 'Espace indisponible'}</h1>{session === 'error' && <><p>{error}</p><Button variant="outline" onClick={() => location.reload()}>Réessayer</Button></>}</div> : <>
 <div className={'demo-banner ' + (config?.mode === 'live' ? 'live-banner' : '')}><span>{config?.mode === 'demo' ? 'ENVIRONNEMENT DÉMO' : config?.baseUrl.includes('preprod') ? 'MYNATIV · PRÉPRODUCTION' : 'MYNATIV · PRODUCTION'}</span>{config?.mode === 'demo' ? 'Des dossiers fictifs pour essayer chaque parcours.' : 'Les actions sont transmises à votre environnement myNativ.'}<span className="banner-end">{config?.mode === 'demo' ? 'Aucune action sur myNativ' : 'Connexion serveur sécurisée'} <LockKeyhole size={14}/></span></div>
 <section className="heading"><div><p className="eyebrow">DU PREMIER CONTACT AU DÉPART</p><h1>Vos voyages, au même endroit.</h1><p className="muted">Suivez les demandes et faites avancer chaque dossier.</p></div><Button variant="outline" onClick={refresh} disabled={loading}><RefreshCw size={16} className={loading ? 'spin' : ''}/> Actualiser</Button></section>
 {error && <div role="alert" className="error-box"><CircleAlert size={18}/>{error}</div>}
 <div className="workspace-grid"><aside className="dossiers"><div className="list-heading"><h2><BriefcaseBusiness size={18}/> Dossiers</h2><span className="count">{trips.length}</span></div><div className="status-groups">{groups.map(([status, items]) => <details className="status-group" key={status}><summary><span>{statusLabels[status] ?? (status || 'Sans statut')}</span><span className="count">{items.length}</span></summary>{items.map(t => <button key={t.commercial_id} onClick={() => { setSelected(t.commercial_id); setFormError(''); }} className={'dossier ' + (t.commercial_id === selected ? 'selected' : '')} aria-pressed={t.commercial_id === selected}><span className="dossier-id">{t.commercial_id} <ChevronRight size={15}/></span><strong>{person(t)}</strong><span>{dates(t.departure_date)} · {Number(t.pax_adults ?? 0) + Number(t.pax_kids ?? 0)} voyageurs</span><small className={'badge ' + (!t.user_id ? 'amber' : '')}>{t.is_deposit_paid ? 'Acompte reçu' : !t.user_id ? 'Sans conseiller' : 'Attribué'}</small></button>)}</details>)}</div>{listProgress && <p className="list-progress" role="status">{listProgress}</p>}{!trips.length && !loading && !listProgress && <p className="list-progress">Aucun dossier dans cet environnement.</p>}<p className="list-foot">Les nouvelles demandes arrivent depuis myNativ.<br />Les événements sont actualisés toutes les 15 secondes.</p></aside>
 <section className="detail" aria-busy={detailLoading}>{!trip || trip.commercial_id !== selected ? <Empty title={detailLoading ? 'Chargement du dossier…' : resourceErrors.detail ? 'Dossier indisponible' : 'Sélectionnez un dossier'}>{resourceErrors.detail ?? 'Les informations du voyage apparaîtront ici.'}</Empty> : <><div className="detail-heading"><div><p className="eyebrow">{trip.commercial_id} <span className={'badge ' + (!trip.user_id ? 'amber' : '')}>{trip.status === 'ABANDONED' ? 'Abandonné' : !trip.user_id ? 'À attribuer' : statusLabels[trip.status ?? ''] ?? trip.status ?? 'En cours'}</span>{unpaid && <span className="badge"><Check size={12}/> Acompte reçu</span>}</p><h2>{person(trip)}</h2><p className="muted">{trip.main_traveler?.email ?? 'Demande de voyage'}</p></div><div className="detail-heading-actions"><div className="avatar">{(trip.main_traveler?.firstname?.[0] ?? '') + (trip.main_traveler?.lastname?.[0] ?? '')}</div><Button variant="outline" disabled={busy || trip.status === 'ABANDONED'} onClick={openAbandon}>Abandonner la demande</Button></div></div><div className="trip-facts"><div><CalendarDays /><span>Départ souhaité<strong>{dates(trip.departure_date)}</strong></span></div><div><UserRound /><span>Voyageurs<strong>{trip.pax_adults ?? '—'} adultes{trip.pax_kids ? `, ${trip.pax_kids} enfants` : ''}</strong></span></div><div><FileText /><span>Budget indicatif<strong>{euros(trip.budget)}</strong></span></div></div>
 <Tabs value={accessibleTab} onValueChange={v => { setTab(v); setFormError(''); }}><TabsList variant="line" className="detail-tabs"><TabsTrigger value="overview">Vue d’ensemble</TabsTrigger><TabsTrigger value="quotes" disabled={!hasAdvisor}>Devis <span className="tab-count">{quotes.length}</span></TabsTrigger><TabsTrigger value="messages" disabled={!hasAdvisor}>Messages <span className="tab-count">{messages.length}</span></TabsTrigger><TabsTrigger value="events">Événements</TabsTrigger></TabsList>
 <TabsContent value="overview"><div className="action-card"><span className="action-icon"><UserRound /></span><div><h3>{user ? user.fullname : trip.user_id ? 'Conseiller #' + trip.user_id : 'Un conseiller pour ce voyage'}</h3><p>{trip.user_id ? 'Conseiller attribué à ce dossier.' : 'Attribuez ce dossier pour commencer l’accompagnement.'}</p></div><Button onClick={() => open('assign')} disabled={!users.length}>{trip.user_id ? 'Réattribuer' : 'Attribuer'} <ArrowUpRight size={16}/></Button></div><div className="section-title"><h3>Le projet de voyage</h3><span className="eyebrow">DEMANDE CLIENT</span></div><p className="travel-note">{trip.travel_detail || 'Aucune précision complémentaire pour ce dossier.'}</p><div className="next-actions"><button disabled={!hasAdvisor} onClick={() => open('quote')}><FileText /><strong>Préparer un devis</strong><span>Partagez votre proposition de voyage.</span><Plus size={17}/></button><button disabled={!hasAdvisor} onClick={() => setTab('messages')}><MessageSquare /><strong>Échanger avec le client</strong><span>Retrouvez toute la conversation.</span><ArrowUpRight size={17}/></button></div></TabsContent>
 <TabsContent value="quotes"><div className="section-title first"><h3>Devis du voyage</h3><Button onClick={() => open('quote')}><Plus size={16}/> Nouveau devis</Button></div>{resourceErrors.quotes ? <p className="error-box" role="alert">{resourceErrors.quotes}</p> : !quotes.length ? <Empty title="Le voyage commence par une proposition"><p>Ajoutez votre devis PDF, les dates et le prix du séjour.</p></Empty> : <div className="quote-list">{quotes.map(q => <article key={q.id} className="quote-card"><span className="action-icon"><FileText /></span><div><strong>{q.travel_name}</strong><p className="muted">Expire le {dates(q.expiration_date)}</p><span className={'badge ' + (q.is_validated ? '' : 'neutral')}>{q.active ? 'Actif' : 'Inactif'}{q.is_validated ? ' · Validé' : ''}</span></div><div className="quote-price"><strong>{euros(q.price)}</strong>{q.media_url && /^https:\/\//.test(q.media_url) && <a href={q.media_url} target="_blank" rel="noopener noreferrer">Ouvrir le PDF <ExternalLink size={13}/></a>}<Button variant="outline" disabled={busy || detailLoading} onClick={() => toggleQuotation(q)}>{q.active ? 'Désactiver' : 'Activer'}</Button></div></article>)}</div>}<div className="modification-card"><div><h3>Un changement dans le voyage ?</h3><p>Envoyez une proposition de modification avec son devis.</p></div><Button variant="outline" onClick={() => { setPriceMode('modification'); open('proposition'); }}>Créer une proposition <ArrowUpRight size={16}/></Button></div><p className="small-note">Une proposition nécessite un devis déjà validé dans myNativ. Son évolution apparaît dans les événements reçus.</p></TabsContent>
 <TabsContent value="messages"><div className="section-title first"><h3>Conversation</h3><span className="muted">{messages.length} messages</span></div>{resourceErrors.messages ? <p className="error-box" role="alert">{resourceErrors.messages}</p> : !messages.length ? <Empty icon={<MessageSquare />} title="Le début de la conversation"><p>Présentez-vous et précisez le projet avec votre voyageur.</p></Empty> : <div className="conversation">{messages.map(m => <article className={'message ' + (m.consultant_id || m.user_id ? 'outgoing' : '')} key={m.id}><div className="message-meta"><strong>{users.find(u => u.id === (m.consultant_id ?? m.user_id))?.fullname ?? (m.consultant_id || m.user_id ? 'Conseiller' : 'Voyageur')}</strong><span>{dates(m.created_at)}</span></div><PlainMessage message={m}/></article>)}</div>}<form className="message-form" onSubmit={sendMessage}><Choice label="Envoyer en tant que" name="message-consultant" value={consultant} onChange={setConsultant} items={users.map(u => ({ value: String(u.id), label: u.fullname }))}/><Field label="Modèle de message"><select value={template} disabled={busy || templatesLoading || !templates.length} onChange={e => { const id = e.target.value; setTemplate(id); const item = templates.find(t => String(t.id) === id); if (item) setDraft(templateText(item.content)); }}><option value="">{templatesLoading ? 'Chargement des modèles…' : 'Sélectionner un modèle'}</option>{templates.map(t => <option key={t.id} value={String(t.id)}>{templateText(t.name) || templateText(t.title) || 'Modèle ' + t.id}</option>)}</select></Field>{templatesError ? <div role="alert" className="error-box">{templatesError} <Button type="button" variant="outline" onClick={() => setTemplatesRetry(v => v + 1)}>Réessayer</Button></div> : !templatesLoading && !templates.length ? <p className="muted">Aucun modèle disponible.</p> : null}{template && <p className="muted">Relisez et personnalisez le message avant l’envoi, notamment les éventuelles variables du modèle.</p>}<Field label="Votre message"><textarea required minLength={3} maxLength={20000} rows={4} placeholder="Bonjour, merci pour votre demande de voyage…" value={draft} onChange={e => setDraft(e.target.value)} disabled={busy}/></Field>{formError && <p role="alert" className="error-box">{formError}</p>}<Button disabled={busy || !consultant || draft.trim().length < 3}><Send size={16}/>{busy ? 'Envoi…' : 'Envoyer le message'}</Button></form></TabsContent>
 <TabsContent value="events"><div className="section-title first"><h3>Événements de ce dossier</h3><span className="badge neutral">myNativ → Partenaire</span></div>{resourceErrors.events && <p role="alert" className="error-box">{resourceErrors.events}</p>}{!related.length ? <Empty icon={<Waypoints />} title="En attente du prochain événement"><p>Les paiements, messages et mises à jour de propositions apparaîtront ici.</p></Empty> : <div className="timeline">{related.map(ev => { let p: Record<string, unknown> = {}; try {
                p = JSON.parse(ev.payload);
            }
            catch { } return <article key={ev.id}><span className="timeline-icon">{ev.event_type === 'payment' ? <CreditCard size={16}/> : ev.event_type === 'message' ? <MessageSquare size={16}/> : <Waypoints size={16}/>}</span><div><strong>{eventLabels[ev.event_type] ?? ev.event_type}</strong><p>{new Date(ev.received_at).toLocaleString('fr-FR')}{p.status ? ' · ' + (statusLabels[String(p.status)] ?? String(p.status)) : ''}{p.amount ? ' · ' + euros(Number(p.amount)) : ''}</p><details><summary>Voir les données reçues</summary><pre>{JSON.stringify(p, null, 2)}</pre></details></div></article>; })}</div>}{config?.mode === 'demo' && <div className="simulation"><FlaskConical size={20}/><div><h3>Essayer un événement entrant</h3><p>Cette simulation reste dans votre démonstration.</p><Choice label="Événement" name="event" value={eventType} onChange={setEventType} items={Object.entries(eventLabels).map(([value, label]) => ({ value, label }))}/><Button variant="outline" disabled={busy} onClick={simulate}>Simuler la réception</Button></div></div>}</TabsContent></Tabs></>}</section></div>
 <footer>myNativ <span>↔</span> Partner Desk</footer>
 </>}
 <Dialog open={!!modal} onOpenChange={v => { if (!busy && !v) {
        setModal('');
        setFormError('');
    } }}><DialogContent className={modal === 'settings' ? 'modal settings-modal' : 'modal'}><DialogHeader><DialogTitle>{({ abandon: 'Abandonner la demande', assign: 'Attribuer le dossier', quote: 'Nouveau devis', proposition: 'Proposition de modification', settings: 'Connexion à myNativ' } as Record<string, string>)[modal]}</DialogTitle><DialogDescription>{modal === 'settings' ? 'Choisissez votre environnement et configurez les échanges avec myNativ.' : `${trip?.commercial_id ?? ''} · ${trip ? person(trip) : ''}`}</DialogDescription></DialogHeader>
 {modal === 'settings' ? <form onSubmit={saveConfig}><fieldset disabled={busy}><Choice label="Mode de fonctionnement" name="mode" value={mode} onChange={setMode} items={[{ value: 'demo', label: 'Démonstration — dossiers fictifs' }, { value: 'live', label: 'Connexion réelle à myNativ' }]}/><Choice label="Environnement myNativ" name="baseUrl" value={base} onChange={setBase} items={[{ value: 'https://preprod.mynativ.app', label: 'Préproduction · preprod.mynativ.app' }, { value: 'https://www.mynativ.app', label: 'Production · www.mynativ.app' }]}/><Field label={'Jeton API partenaire' + (config?.hasApiToken ? ' — enregistré' : '')}><input name="apiToken" type="password" autoComplete="new-password" placeholder={config?.hasApiToken ? 'Laisser vide pour conserver le jeton' : 'Coller le jeton Bearer du partenaire'}/></Field><Field label={'Jeton des webhooks (X-token)' + (config?.hasWebhookToken ? ' — enregistré' : '')}><input name="webhookToken" type="password" autoComplete="new-password" placeholder="Même valeur que celle configurée côté myNativ"/></Field><p className="small-note">Les jetons sont chiffrés côté serveur et ne sont jamais renvoyés au navigateur. Changer d’environnement nécessite de saisir son jeton API.</p><div className="form-actions"><Button disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer la connexion'}</Button><Button type="button" variant="outline" disabled={busy || !config?.hasApiToken} onClick={async () => { setBusy(true); setFormError(''); try {
            await request('/api/config/test', { method: 'POST' });
            toast.success('Connexion à myNativ réussie.');
        }
        catch (e) {
            setFormError(notifyError(e));
        }
        finally {
            setBusy(false);
        } }}>Tester la connexion enregistrée</Button></div><div className="webhook-config"><h3>URLs à configurer dans myNativ</h3><p className="small-note">Activez les webhooks du partenaire et le mode réel. Chaque envoi doit contenir l’en-tête X-token.</p>{Object.entries(eventLabels).map(([key, label]) => <div className="webhook-url" key={key}><span>{label}</span><code>{typeof window !== 'undefined' ? window.location.origin : ''}/api/webhooks/{key}</code><Button type="button" variant="ghost" size="icon" aria-label={'Copier URL ' + label} onClick={async () => { try {
            await navigator.clipboard.writeText(location.origin + '/api/webhooks/' + key);
            toast.success('URL copiée.');
        }
        catch {
            toast.error('Copie indisponible : sélectionnez l’URL.');
        } }}><Copy size={15}/></Button></div>)}<p className="small-note">La route « proposition » reçoit toutes les mises à jour de statut. Une incohérence de nom de champ dans le code myNativ peut empêcher son émission : voir le README du projet.</p></div></fieldset></form> : <form onSubmit={submitAction}><fieldset disabled={busy}>{modal === 'abandon' ? <>{reasonsLoading ? <p>Chargement des motifs…</p> : <Choice name="reason_id" label="Motif d’abandon" value={reason} onChange={setReason} items={reasons.map(r => ({ value: String(r.id), label: r.label }))}/>}<Field label="Précisions sur l’abandon"><textarea name="reason_description" required minLength={3} maxLength={1000} rows={4}/></Field><p className="small-note">La validation passera ce dossier au statut abandonné.</p></> : modal === 'assign' ? <Choice name="user_id" label="Conseiller" value={consultant} onChange={setConsultant} items={users.map(u => ({ value: String(u.id), label: u.fullname }))}/> : <>
 {modal === 'quote' ? <><Field label="Nom du voyage"><input name="travel_name" required maxLength={80} placeholder="Un voyage dans l’Atlas"/></Field><div className="form-grid"><Field label="Date de départ"><input name="departure_date" type="date" required defaultValue={trip?.departure_date?.slice(0, 10)}/></Field><Field label="Date de retour"><input name="return_date" type="date" required/></Field><Field label="Adultes"><input name="pax_adults" type="number" min={1} max={100} step={1} defaultValue={trip?.pax_adults || 1} required/></Field><Field label="Enfants"><input name="pax_kids" type="number" min={0} max={100} step={1} defaultValue={trip?.pax_kids || 0} required/></Field></div></> : <><Field label="Description de la modification"><textarea name="message" required minLength={3} maxLength={100} rows={3} placeholder="Une nuit supplémentaire à Marrakech"/></Field><Choice name="price_mode" label="Interprétation du prix" value={priceMode} onChange={setPriceMode} items={[{ value: 'modification', label: 'Supplément lié à la modification' }, { value: 'travel_request', label: 'Nouveau prix total du voyage' }]}/></>}
 <div className="form-grid"><Field label={modal === 'proposition' && priceMode === 'modification' ? 'Supplément en euros' : 'Prix total en euros'}><input name="price" type="number" min={1} max={1000000} step="0.01" required placeholder="0,00"/></Field><Field label="Expiration du devis"><input name="expiration_date" type="datetime-local" required/></Field></div><Field label="Devis PDF"><span className="upload-field"><Upload size={20}/><input name="quotation" type="file" accept="application/pdf,.pdf" required/><span>PDF · 30 Mo maximum</span></span></Field>{config?.mode === 'demo' && <p className="small-note">En démo, le PDF est vérifié mais son contenu n’est pas conservé.</p>}</>}
 <div className="form-actions"><Button type="button" variant="outline" onClick={() => setModal('')}>Annuler</Button><Button disabled={busy || (modal === 'assign' && !consultant) || (modal === 'abandon' && (reasonsLoading || !reason))}>{busy ? 'Envoi…' : modal === 'assign' ? 'Attribuer' : config?.mode === 'demo' ? 'Enregistrer dans la démo' : 'Envoyer à myNativ'}</Button></div></fieldset></form>}{formError && <p className="error-box" role="alert">{formError}</p>}</DialogContent></Dialog>
 </main>;
}
