import test from 'node:test';
import assert from 'node:assert/strict';
import {routeAllowed,validateAssignment,validateMessage,validateEvent,eventReference,eventKey,secureEqual,limitedText,readJson,checkOrigin,safeBase,uploadStream} from '../lib/contracts.mjs';
const rejectsStatus=(status)=>e=>e.status===status;
test('le proxy autorise seulement les opérations du client',()=>{
 for(const [m,p] of [['GET','messages/templates'],['GET','users'],['GET','travel-requests'],['PUT','travel-requests/MAR2026-0421'],['POST','travel-requests/MAR2026-0421/propositions'],['POST','travel-requests/MAR2026-0421/quotations'],['POST','travel-requests/MAR2026-0421/messages']])assert.equal(routeAllowed(m,p),true);
 for(const [m,p] of [['POST','messages/templates'],['GET','messages/templates/1'],['DELETE','travel-requests/X'],['GET','https://evil.test'],['POST','travel-requests/../users'],['GET','travel-requests/X/../../users'],['POST','travel-requests/X/abandon'],['GET','users?token=x']])assert.equal(routeAllowed(m,p),false);
});
test('assignation et message utilisent les champs vérifiés dans le backend',()=>{assert.deepEqual(validateAssignment({user_id:11,status:'REGISTERED'}),{user_id:11});assert.throws(()=>validateAssignment({user_id:'11'}),rejectsStatus(422));assert.throws(()=>validateAssignment({user_id:-1}),rejectsStatus(422));assert.deepEqual(validateMessage({consultant_id:11,message:'Bonjour',user_id:12}),{consultant_id:11,message:'Bonjour'});assert.throws(()=>validateMessage({consultant_id:11,message:'  '}),rejectsStatus(422));assert.throws(()=>validateMessage({consultant_id:0,message:'Bonjour'}),rejectsStatus(422));});
test('formats des quatre webhooks réels et rattachement au dossier',()=>{const payloads={'new-request':{id:421,commercial_id:'MAR2026-0421'},payment:{id:1,amount:1200,travel_request:{id:421,commercial_id:'MAR2026-0421'}},proposition:{id:2,status:'VALIDATED',travel_request:{id:421,commercial_id:'MAR2026-0421'}},message:{id:3,travel_request_id:421,message:'Bonjour'}};for(const [type,p] of Object.entries(payloads)){assert.equal(validateEvent(type,p),p);assert.equal(eventReference(type,p).travel_id,421);}assert.throws(()=>validateEvent('payment',{id:1}),rejectsStatus(422));assert.throws(()=>validateEvent('unknown',{id:1,travel_request_id:421}),rejectsStatus(422));});
test('un retry identique est dédoublonné, un changement de statut reste distinct',async()=>{const a={id:2,status:'PENDING',travel_request:{id:421}};const b={travel_request:{id:421},status:'PENDING',id:2};assert.equal(await eventKey('proposition',a),await eventKey('proposition',b));assert.notEqual(await eventKey('proposition',a),await eventKey('proposition',{...a,status:'VALIDATED'}));assert.notEqual(await eventKey('payment',a),await eventKey('proposition',a));});
test('jetons, origines et hôtes non autorisés sont rejetés',async()=>{assert.equal(await secureEqual('secret','secret'),true);assert.equal(await secureEqual('secret',''),false);assert.equal(await secureEqual('secret','secreu'),false);assert.equal(safeBase('https://preprod.mynativ.app'),'https://preprod.mynativ.app');assert.throws(()=>safeBase('http://127.0.0.1'),rejectsStatus(422));assert.throws(()=>safeBase('https://preprod.mynativ.app.evil.test'),rejectsStatus(422));assert.throws(()=>checkOrigin(new Request('https://desk.example/api/config',{method:'PUT',headers:{origin:'https://evil.test'}})),rejectsStatus(403));assert.throws(()=>checkOrigin(new Request('https://desk.example/api/config',{method:'PUT'})),rejectsStatus(403));checkOrigin(new Request('https://desk.example/api/config',{method:'PUT',headers:{origin:'https://desk.example'}}));});
test('limites appliquées aussi sans Content-Length',async()=>{assert.equal(await limitedText(new Request('https://example.test',{method:'POST',body:'hello'}),5),'hello');await assert.rejects(()=>limitedText(new Request('https://example.test',{method:'POST',body:'hello!'}),5),rejectsStatus(413));await assert.rejects(()=>readJson(new Request('https://example.test',{method:'POST',body:'invalid'})),rejectsStatus(400));const stream=new Blob(['123456']).stream();await assert.rejects(()=>new Response(uploadStream(stream,5)).text(),rejectsStatus(413));});

test('toutes les pages de demandes sont chargées et les doublons sont supprimés', async () => {
 const { loadAllRequests } = await import('../lib/request-list.mjs');
 const urls = [];
 const pages = [
  { data: [{commercial_id:'A', status:'NEW'}], meta:{last_page:3} },
  { data: [{commercial_id:'B', status:'ABANDONED'}], meta:{last_page:3} },
  { data: [{commercial_id:'A', status:'QUOTATION_SENT'}, {commercial_id:'C', status:'NEW'}], meta:{last_page:3} }
 ];
 const items = await loadAllRequests(async url => { urls.push(url); return pages[urls.length-1]; }, async () => {});
 assert.deepEqual(urls, [1,2,3].map(page => '/api/partner/travel-requests?page='+page));
 assert.deepEqual(items.map(t => t.commercial_id), ['A','B','C']);
 assert.equal(items[0].status, 'QUOTATION_SENT');
 assert.deepEqual(await loadAllRequests(async () => ({data:[]})), []);
});
test('une page en erreur empêche de présenter une liste partielle comme complète', async () => {
 const { loadAllRequests } = await import('../lib/request-list.mjs');
 await assert.rejects(loadAllRequests(async url => {
  if(url.endsWith('=2')) throw new Error('Indisponible');
  return {data:[{commercial_id:'A'}], meta:{last_page:2}};
 }, async () => {}), /Indisponible/);
 await assert.rejects(loadAllRequests(async () => ({data:{}})), /Format/);
 await assert.rejects(loadAllRequests(async () => ({data:[],meta:{last_page:'invalid'}})), /Pagination/);
});

 test('le chargement espace les pages et respecte Retry-After sans recommencer la liste', async () => {
 const { loadAllRequests } = await import('../lib/request-list.mjs');
 const calls = [], waits = [];
 let limited = false;
 const result = await loadAllRequests(async url => {
  calls.push(url);
  if (url.endsWith('=2') && !limited) { limited = true; throw Object.assign(new Error('Limite'), {status:429,retryAfterMs:42000}); }
  return {data:[{commercial_id:url}],meta:{last_page:2}};
 }, async ms => { waits.push(ms); });
 assert.equal(result.length, 2);
 assert.deepEqual(waits, [1500,42000]);
 assert.deepEqual(calls.map(url => url.split('=').pop()), ['1','2','2']);
 });

test('les premiers dossiers sont publiés avant que la page suivante ne soit reçue', async () => {
 const { loadAllRequests } = await import('../lib/request-list.mjs');
 let release;
 const nextPage = new Promise(resolve => { release = resolve; });
 const progress = [];
 let firstReceived;
 const firstPage = new Promise(resolve => { firstReceived = resolve; });
 const loading = loadAllRequests(async url => url.endsWith('=1')
  ? {data:[{commercial_id:'A'}],meta:{last_page:2}}
  : nextPage, async () => {}, {onProgress: (items,page,last) => {
   progress.push({ids:items.map(item => item.commercial_id),page,last}); firstReceived();
  }});
 await firstPage;
 assert.deepEqual(progress, [{ids:['A'],page:1,last:2}]);
 release({data:[{commercial_id:'B'}],meta:{last_page:2}});
 await loading;
 assert.deepEqual(progress[1], {ids:['A','B'],page:2,last:2});
});

test('une erreur ultérieure conserve les dossiers publiés et annonce la pause 429', async () => {
 const { loadAllRequests } = await import('../lib/request-list.mjs');
 const progress = [], waits = [];
 await assert.rejects(loadAllRequests(async url => {
  if (url.endsWith('=1')) return {data:[{commercial_id:'A'}],meta:{last_page:2}};
  throw Object.assign(new Error('Limite'),{status:429,retryAfterMs:2000});
 }, async () => {}, {onProgress: items => progress.push(items),onWait: ms => waits.push(ms)}), /Limite/);
 assert.deepEqual(progress, [[{commercial_id:'A'}]]);
 assert.deepEqual(waits,[2000]);
});
