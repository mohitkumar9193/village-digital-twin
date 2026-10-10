import {test} from 'node:test';
import assert from 'node:assert/strict';
import {deploymentConfig} from '../deployment-config.js';
import {api} from '../src/api.js';
test('Vercel API rewrite keeps backend origin and routes before SPA fallback',()=>{
 const c=deploymentConfig('https://village-api.onrender.com/');
 assert.equal(c.framework,'vite');assert.equal(c.outputDirectory,'dist');
 assert.deepEqual(c.rewrites[0],{source:'/api/:path*',destination:'https://village-api.onrender.com/api/:path*'});
 assert.equal(c.headers[0].headers[0].value,'private, no-store');
});
test('deployment refuses missing backend, localhost, credentials and API suffixes',()=>{
 for(const value of [undefined,'http://localhost:4000','https://localhost','https://127.0.0.1','https://user:secret@api.example.com','https://api.example.com/api/v1','https://api.example.com?token=secret'])assert.throws(()=>deploymentConfig(value));
});
test('browser API preserves credentials, bearer token and JSON POST through same-origin proxy',async()=>{
 const original=globalThis.fetch;let call;
 globalThis.fetch=async(url,options)=>{call={url,options};return new Response(JSON.stringify({data:{status:'submitted'}}),{headers:{'content-type':'application/json'}});};
 try{const r=await api('/complaints',{method:'POST',token:'test-access-token',body:{title:'Road repair'}});assert.equal(call.url,'/api/v1/complaints');assert.equal(call.options.credentials,'include');assert.equal(call.options.headers.Authorization,'Bearer test-access-token');assert.equal(r.data.status,'submitted');}finally{globalThis.fetch=original;}
});
test('missing Vercel API proxy is reported instead of treating index HTML as success',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async()=>new Response('<html>index</html>',{headers:{'content-type':'text/html'}});
 try{await assert.rejects(()=>api('/auth/login'),/API connection unavailable/);}finally{globalThis.fetch=original;}
});
test('multipart uploads keep browser-generated boundary and logout accepts empty 204',async()=>{
 const original=globalThis.fetch;let options;globalThis.fetch=async(u,o)=>{options=o;return new Response(null,{status:204});};
 try{const body=new FormData();body.append('image',new Blob(['sample'],{type:'image/jpeg'}),'sample.jpg');await api('/complaints/id/attachments',{method:'POST',token:'token',body});assert.equal(options.body,body);assert.equal(options.headers['Content-Type'],undefined);assert.deepEqual(await api('/auth/logout',{method:'POST'}),{});}finally{globalThis.fetch=original;}
});
