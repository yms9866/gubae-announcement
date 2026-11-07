export async function ensureSignInDomain({projectId,frontendUrl,credentials,fetcher=fetch}){
 const host=new URL(frontendUrl).hostname;
 const access=await credentials.getAccessToken(),url='https://identitytoolkit.googleapis.com/admin/v2/projects/'+encodeURIComponent(projectId)+'/config';
 const headers={Authorization:'Bearer '+access.access_token,'Content-Type':'application/json'};
 const response=await fetcher(url,{headers,signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('Google sign-in configuration could not be checked.');
 const config=await response.json(),domains=config.authorizedDomains||[];
 if(domains.includes(host))return true;
 const updated=await fetcher(url+'?updateMask=authorizedDomains',{method:'PATCH',headers,body:JSON.stringify({authorizedDomains:[...domains,host]}),signal:AbortSignal.timeout(15000)});
 if(!updated.ok)throw Error('Google sign-in domain configuration needs attention.');
 return true;
}
