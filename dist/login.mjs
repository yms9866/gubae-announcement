import {connectAuth} from './firebase-auth.mjs';
const status=document.querySelector('#loginStatus'),button=document.querySelector('#login'),switcher=document.querySelector('#switchAccount');
let auth,busy=false,blockedUser=null;
const candidate=new URL(new URLSearchParams(location.search).get('next')||'/',location.origin);
const target=candidate.origin===location.origin&&candidate.pathname!=='/login.html'?candidate.pathname+candidate.search:'/';
try{
 const configResponse=await fetch('/api/config',{cache:'no-store'});if(!configResponse.ok)throw Error('The sign-in service is unavailable. Please retry.');
 const config=await configResponse.json();
 auth=await connectAuth(config.firebase,async user=>{
  if(!user){button.disabled=false;status.textContent='Sign in to open your workspace.';return;}
  if(busy||blockedUser===user.uid)return;busy=true;button.disabled=true;status.textContent='Checking workspace access…';
  try{
   const response=await fetch('/api/browser-session',{method:'POST',headers:{Authorization:'Bearer '+await user.getIdToken(),'Content-Type':'application/json'},body:'{}'});
   const result=await response.json();if(!response.ok)throw Error(result.error||'This account does not have workspace access.');
   location.replace(result.scope==='announcements'?'announcements.html':target);
  }catch(error){blockedUser=user.uid;status.textContent=error.message;switcher.hidden=false;button.disabled=false;}
  finally{busy=false;}
 });
 button.onclick=async()=>{blockedUser=null;status.textContent='Opening Google sign-in…';try{await auth.signIn()}catch(error){status.textContent=error.message;}};
 switcher.onclick=async()=>{blockedUser=null;await auth.signOut();switcher.hidden=true;button.disabled=false;status.textContent='Choose your authorized Google account.';};
}catch(error){status.textContent=error.message;}
