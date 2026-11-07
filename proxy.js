import {next} from '@vercel/functions';
const PUBLIC=new Set(['/login.html','/login.mjs','/styles.css','/firebase-auth.mjs','/cloud-config.json','/report.html','/report-page.mjs','/report-form.mjs','/reporting.mjs','/teacher-match.mjs','/meeting-status.mjs','/favicon.ico','/robots.txt','/teachers-day.html','/teachers-day.mjs','/teacher-days.mjs','/announcements.html','/announcements.mjs','/access.css','/core.mjs','/announcement-timing.mjs']);
const verified=new Map();
export default async function proxy(request){
 const url=new URL(request.url);
 if(PUBLIC.has(url.pathname)||url.pathname.startsWith('/api/'))return next();
 if((url.pathname==='/'||url.pathname==='/index.html')&&url.searchParams.has('report')){
  const target=new URL('/report.html',url);target.search=url.search;return Response.redirect(target,307);
 }
 const cookie=(request.headers.get('cookie')||'').split(';').map(v=>v.trim()).filter(v=>v.startsWith('__Host-gubae_session=')||v.startsWith('__Host-gubae_access=')).join('; ');
 let allowed=false,scope;
 if(cookie){
  const cached=verified.get(cookie);
  if(cached&&cached.until>Date.now()){allowed=true;scope=cached.scope;}
  else try{
   const response=await fetch('https://gubae-announcements-api.onrender.com/api/browser-session',{headers:{cookie},cache:'no-store',signal:AbortSignal.timeout(15000)});
   if(response.ok){const data=await response.json();allowed=data.authenticated===true;scope=data.scope||'full';if(allowed){if(verified.size>100)verified.clear();verified.set(cookie,{until:Date.now()+20000,scope});}}
  }catch{}
 }
 if(allowed&&scope!=='full')return new Response(null,{status:303,headers:{Location:new URL('/announcements.html',url).href,'Cache-Control':'private, no-store'}});
 if(allowed)return next({headers:{'Cache-Control':'private, no-store'}});
 const login=new URL('/login.html',url);login.searchParams.set('next',url.pathname+url.search);
 return new Response(null,{status:303,headers:{Location:login.href,'Cache-Control':'private, no-store'}});
}
