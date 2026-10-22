import test from 'node:test';import assert from 'node:assert/strict';import {ensureSignInDomain} from '../auth-domain.mjs';
test('Google sign-in adds only the configured frontend domain and preserves existing domains',async()=>{
 const calls=[];const fetcher=async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({authorizedDomains:['announcement-92146.firebaseapp.com']})}};
 assert(await ensureSignInDomain({projectId:'project',frontendUrl:'https://gubae-announcements.vercel.app',credentials:{getAccessToken:async()=>({access_token:'test-only'})},fetcher}));
 assert.deepEqual(JSON.parse(calls[1].options.body).authorizedDomains,['announcement-92146.firebaseapp.com','gubae-announcements.vercel.app']);
 assert.match(calls[1].url,/updateMask=authorizedDomains/);
});
