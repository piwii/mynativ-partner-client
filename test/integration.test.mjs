import test from 'node:test';import assert from 'node:assert/strict';
import {env} from './platform.mjs';
import * as config from '../app/api/config/route.ts';
import * as partner from '../app/api/partner/[...path]/route.ts';
import * as webhook from '../app/api/webhooks/[event]/route.ts';
import * as events from '../app/api/events/route.ts';
import * as demoEvent from '../app/api/demo/event/route.ts';
const origin='https://desk.example';
const json=(path,method,body,extra={})=>new Request(origin+path,{method,headers:{origin,'Content-Type':'application/json',...extra},body:JSON.stringify(body)});
const req=(method,path,body)=>partner[method](body??new Request(origin+'/api/partner/'+path,{method}),{params:Promise.resolve({path:path.split('/')})});
const body=async r=>({status:r.status,data:await r.json()});
test('API publique : configuration accessible sans session',async()=>{const r=await config.GET();assert.equal(r.status,200);assert.equal('email' in await r.json(),false);});
test('parcours démo : liste, attribution, devis PDF, proposition, message, événements durables',async()=>{
 const c=await body(await config.GET());assert.equal(c.data.mode,'demo');assert.equal(c.data.hasApiToken,false);
 const list=await body(await req('GET','travel-requests'));assert.equal(list.data.data.length,3);const id='MAR2026-0421';
 const assignment=await body(await req('PUT','travel-requests/'+id,json('/api/partner/travel-requests/'+id,'PUT',{user_id:11})));assert.equal(assignment.data.data.user_id,11);
 const form=new FormData();Object.entries({travel_name:'Séjour test',price:'2500',expiration_date:'2027-01-01 18:00:00',departure_date:'2027-02-01',return_date:'2027-02-10',pax_adults:'2',pax_kids:'0'}).forEach(([k,v])=>form.set(k,v));form.set('quotation',new File(['%PDF-1.4\n%%EOF'],'test.pdf',{type:'application/pdf'}));
 const upload=await body(await req('POST','travel-requests/'+id+'/quotations',new Request(origin+'/api/partner/travel-requests/'+id+'/quotations',{method:'POST',headers:{origin},body:form})));assert.equal(upload.status,200);assert.equal(upload.data.data.travel_name,'Séjour test');
 const q=await body(await req('GET','travel-requests/'+id+'/quotations'));assert.equal(q.data.data.length,1);assert.equal(q.data.data[0].price,2500);
 const togglePath='travel-requests/'+id+'/quotations/'+q.data.data[0].id+'/toggle';
 for(const active of [false,true]) { const result=await body(await req('PUT',togglePath,new Request(origin+'/api/partner/'+togglePath,{method:'PUT',headers:{origin}})));assert.equal(result.status,200);assert.equal(result.data.data.active,active);assert.equal((await body(await req('GET','travel-requests/'+id+'/quotations'))).data.data[0].active,active); }
 const wrongPath='travel-requests/JPN2026-0186/quotations/'+q.data.data[0].id+'/toggle';
 assert.equal((await req('PUT',wrongPath,new Request(origin+'/api/partner/'+wrongPath,{method:'PUT',headers:{origin}}))).status,404);
 const reasons=await body(await req('GET','statuses/abandoned/reasons'));assert.ok(reasons.data.data.length);
 const abandonPath='travel-requests/'+id+'/abandon';
 for(const payload of [{reason_id:999,reason_description:'Projet annulé'},{reason_id:1,reason_description:'x'},{reason_id:1}])assert.equal((await req('PUT',abandonPath,json('/api/partner/'+abandonPath,'PUT',payload))).status,422);
 assert.equal((await req('PUT',abandonPath,json('/api/partner/'+abandonPath,'PUT',{reason_id:reasons.data.data[0].id,reason_description:'Projet annulé'}))).status,200);
 assert.equal((await body(await req('GET','travel-requests/'+id))).data.data.status,'ABANDONED');
 assert.equal((await req('PUT',abandonPath,json('/api/partner/'+abandonPath,'PUT',{reason_id:1,reason_description:'Projet annulé'}))).status,403);
 const prop=new FormData();Object.entries({message:'Une nuit supplémentaire',price:'200',price_mode:'modification',expiration_date:'2027-01-01 18:00:00'}).forEach(([k,v])=>prop.set(k,v));prop.set('quotation',new File(['%PDF-1.4\n%%EOF'],'change.pdf',{type:'application/pdf'}));assert.equal((await req('POST','travel-requests/'+id+'/propositions',new Request(origin+'/api/partner/travel-requests/'+id+'/propositions',{method:'POST',headers:{origin},body:prop}))).status,200);
 assert.equal((await req('POST','travel-requests/'+id+'/messages',json('/api/partner/travel-requests/'+id+'/messages','POST',{consultant_id:11,message:'Bonjour Camille'}))).status,200);
 assert.equal((await body(await req('GET','travel-requests/'+id+'/messages'))).data.data.length,1);
 for(const type of ['payment','proposition','message','new-request'])assert.equal((await demoEvent.POST(json('/api/demo/event','POST',{type,commercial_id:id}))).status,200);
 const ev=await body(await events.GET());assert.equal(ev.data.data.length,4);assert.ok(ev.data.data.every(x=>x.source==='demo'));
 const refreshed=await body(await req('GET','travel-requests/'+id));assert.equal(refreshed.data.data.is_deposit_paid,true);
});
test('configuration chiffrée : secrets non renvoyés et changement d’hôte sans jeton refusé',async()=>{
 assert.equal((await config.PUT(json('/api/config','PUT',{mode:'live',baseUrl:'https://preprod.mynativ.app',apiToken:'api-secret',webhookToken:'webhook-secret'}))).status,200);
 const row=await env.DB.prepare('SELECT value FROM settings WHERE key=?').bind('connection').first();assert.equal(row.value.includes('api-secret'),false);assert.equal(row.value.includes('webhook-secret'),false);
 const result=await body(await config.GET());assert.equal(result.data.hasApiToken,true);assert.equal(JSON.stringify(result).includes('api-secret'),false);
 assert.equal((await config.PUT(json('/api/config','PUT',{mode:'live',baseUrl:'https://www.mynativ.app'}))).status,422);
 assert.equal((await config.PUT(json('/api/config','PUT',{mode:'live',baseUrl:'https://evil.example'}))).status,422);
});
test('webhooks réels : authentification, dédoublonnage, nouveau statut, séparation de la démo',async()=>{
 const p={id:20,status:'PENDING',travel_request:{id:421,commercial_id:'MAR2026-0421'}};
 const send=(payload,token)=>webhook.POST(json('/api/webhooks/proposition','POST',payload,{'X-token':token}),{params:Promise.resolve({event:'proposition'})});
 assert.equal((await send(p,'bad')).status,401);assert.equal((await body(await send(p,'webhook-secret'))).data.duplicate,false);assert.equal((await body(await send(p,'webhook-secret'))).data.duplicate,true);assert.equal((await body(await send({...p,status:'VALIDATED'},'webhook-secret'))).data.duplicate,false);
 await (async()=>{const v=await body(await events.GET());assert.equal(v.data.data.length,2);assert.ok(v.data.data.every(x=>x.source==='live:https://preprod.mynativ.app'));assert.equal((await demoEvent.POST(json('/api/demo/event','POST',{type:'payment',commercial_id:'MAR2026-0421'}))).status,403);})();
});
test('proxy réel : Bearer serveur, pagination, multipart intact, erreur Laravel conservée',async()=>{
 const original=globalThis.fetch;const calls=[];globalThis.fetch=async(url,init)=>{calls.push({url,init});if(String(url).endsWith('/messages'))return Response.json({message:'Données invalides',errors:{consultant_id:['Conseiller incorrect']}},{status:422});if(init.body instanceof ReadableStream){const f=await new Request(url,{method:'POST',headers:init.headers,body:init.body,duplex:'half'}).formData();assert.equal(f.get('quotation').name,'real.pdf');assert.equal(await f.get('quotation').text(),'%PDF-1.4\n%%EOF');}return Response.json({data:[]});};
 try{const r=await body(await req('GET','travel-requests'));assert.equal(r.status,200);assert.match(calls[0].url,/api\/v1\/connectors\/travel-requests\?page=1&per_page=20&sort=-created_at/);assert.equal(calls[0].init.headers.Authorization,'Bearer api-secret');assert.equal(calls[0].init.redirect,'manual');
 await req('GET','statuses/abandoned/reasons');assert.ok(calls.at(-1).url.endsWith('/statuses/abandoned/reasons'));
 const abandonPath='travel-requests/MAR2026-0421/abandon';
 assert.equal((await req('PUT',abandonPath,json('/api/partner/'+abandonPath,'PUT',{reason_id:2,reason_description:'Budget insuffisant',user_id:12}))).status,200);
 assert.equal(calls.at(-1).init.method,'PUT');assert.deepEqual(JSON.parse(calls.at(-1).init.body),{reason_id:2,reason_description:'Budget insuffisant'});
 const togglePath='travel-requests/MAR2026-0421/quotations/12/toggle';
 assert.equal((await req('PUT',togglePath,new Request(origin+'/api/partner/'+togglePath,{method:'PUT',headers:{origin}}))).status,200);
 assert.ok(calls.at(-1).url.endsWith('/quotations/12/toggle'));assert.equal(calls.at(-1).init.body,undefined);
 assert.equal((await req('PUT',togglePath)).status,403);
 const f=new FormData();f.set('price','3000');f.set('quotation',new File(['%PDF-1.4\n%%EOF'],'real.pdf',{type:'application/pdf'}));assert.equal((await req('POST','travel-requests/MAR2026-0421/quotations',new Request(origin+'/api/partner/travel-requests/MAR2026-0421/quotations',{method:'POST',headers:{origin},body:f}))).status,200);
 const bad=await body(await req('POST','travel-requests/MAR2026-0421/messages',json('/api/partner/travel-requests/MAR2026-0421/messages','POST',{consultant_id:11,message:'Bonjour'})));assert.equal(bad.status,422);assert.deepEqual(bad.data.errors,{consultant_id:['Conseiller incorrect']});
 }finally{globalThis.fetch=original;}
});

test('proxy réel : redirection refusée sans suivre la destination',async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async(url,init)=>{calls++;assert.equal(init.redirect,'manual');return new Response(null,{status:302,headers:{Location:'https://other.example'}});};
 try{const r=await body(await req('GET','users'));assert.equal(r.status,502);assert.match(r.data.message,/redirection/);assert.equal(calls,1);}finally{globalThis.fetch=original;}
});
