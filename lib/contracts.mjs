export const BASES = ['https://preprod.mynativ.app', 'https://www.mynativ.app', 'https://mynativ.app'];
export const EVENT_TYPES = ['new-request', 'payment', 'proposition', 'message'];
export class ApiError extends Error { constructor(status, message, errors) { super(message); this.status=status; this.errors=errors; } }
export function routeAllowed(method, path) {
 if (method==='GET') return /^(users|travel-requests|travel-requests\/[A-Za-z0-9_-]+(?:\/(messages|quotations))?)$/.test(path);
 if (method==='PUT') return /^travel-requests\/[A-Za-z0-9_-]+$/.test(path);
 if (method==='POST') return /^travel-requests\/[A-Za-z0-9_-]+\/(messages|quotations|propositions)$/.test(path);
 return false;
}
export function unwrap(value) { return value?.data ?? value; }
export function validateAssignment(v) { if (!Number.isSafeInteger(v.user_id)||v.user_id<1) throw new ApiError(422,'Choisissez un conseiller.'); return {user_id:v.user_id}; }
export function validateMessage(v) { if (!Number.isSafeInteger(v.consultant_id)||v.consultant_id<1 || typeof v.message!=='string'||v.message.trim().length<3||v.message.length>20000) throw new ApiError(422,'Un conseiller et un message de 3 à 20 000 caractères sont nécessaires.'); return {consultant_id:v.consultant_id,message:v.message}; }
export function eventReference(type,p) { return {commercial_id:p.travel_request?.commercial_id??p.commercial_id??null,travel_id:p.travel_request?.id??p.travel_request_id??(type==='new-request'?p.id:null)}; }
export function validateEvent(type,p) { if (!EVENT_TYPES.includes(type)||!p||typeof p!=='object'||Array.isArray(p)||p.id==null) throw new ApiError(422,'Événement invalide.'); const ref=eventReference(type,p); if(ref.commercial_id==null&&ref.travel_id==null) throw new ApiError(422,'Dossier manquant dans l’événement.'); return p; }
export function canonical(value) { if(Array.isArray(value)) return '['+value.map(canonical).join(',')+']'; if(value && typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';return JSON.stringify(value); }
export async function digest(value) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join(''); }
export async function eventKey(type,p) { return digest(type+':'+canonical(p)); }
export async function secureEqual(a,b) { const [x,y]=await Promise.all([digest(a),digest(b)]);let diff=0;for(let i=0;i<x.length;i++)diff|=x.charCodeAt(i)^y.charCodeAt(i);return diff===0; }
export async function limitedText(request,limit=1048576) { if(Number(request.headers.get('content-length'))>limit)throw new ApiError(413,'Requête trop volumineuse.');const reader=request.body?.getReader();if(!reader)return '';let total=0;const parts=[];try{while(true){const {value,done}=await reader.read();if(done)break;total+=value.byteLength;if(total>limit){await reader.cancel();throw new ApiError(413,'Requête trop volumineuse.');}parts.push(value);}}finally{reader.releaseLock();}const result=new Uint8Array(total);let at=0;for(const part of parts){result.set(part,at);at+=part.length;}return new TextDecoder().decode(result); }
export async function readJson(request) { try { return JSON.parse(await limitedText(request)); } catch(e) { if(e instanceof ApiError)throw e;throw new ApiError(400,'JSON invalide.'); } }
export function checkOrigin(request) { const origin=request.headers.get('origin');if(origin!==new URL(request.url).origin)throw new ApiError(403,'Origine de la requête refusée.'); }
export function safeBase(base) { if(!BASES.includes(base))throw new ApiError(422,'Sélectionnez un environnement myNativ autorisé.');return base; }
export function uploadStream(body,limit=32*1024*1024) { let count=0;return body?.pipeThrough(new TransformStream({transform(chunk,controller){count+=chunk.byteLength;if(count>limit)throw new ApiError(413,'Le PDF doit faire moins de 30 Mo.');controller.enqueue(chunk);}})); }
