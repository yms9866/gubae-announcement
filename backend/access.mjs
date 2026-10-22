import {createHash,timingSafeEqual} from 'node:crypto';
export const accessHash=token=>createHash('sha256').update(token).digest('hex');
const denied=()=>Object.assign(Error('This email does not have site access. Contact the organizer.'),{status:403});
export async function accessForEmail(store,user,owners){
 if(!user.email_verified||typeof user.email!=='string')throw denied();
 const email=user.email.toLowerCase();
 if(owners.has(email))return{...user,email,scope:'full',owner:true};
 const [list,config]=await Promise.all([store.get('settings','email-reminders'),store.get('settings','workspace-access')]);
 if(!list?.recipients?.includes(email))throw denied();
 const entry=config?.entries?.find(e=>e.email===email)||{role:'blocked',method:'link'};
 if(entry.role==='blocked'||entry.method!=='google')throw denied();
 return{...user,email,scope:entry.role,owner:false};
}
export async function accessForLink(store,token,now=new Date()){
 if(!/^gsa_[A-Za-z0-9_-]{43}$/.test(token||''))throw denied();
 const [list,config]=await Promise.all([store.get('settings','email-reminders'),store.get('settings','workspace-access')]);
 const actual=accessHash(token);
 const entry=config?.entries?.find(e=>e.method==='link'&&['announcements','full'].includes(e.role)&&e.tokenHash?.length===64&&timingSafeEqual(Buffer.from(actual),Buffer.from(e.tokenHash)));
 if(!entry||!list?.recipients?.includes(entry.email)||(entry.expiresAt&&entry.expiresAt<=now.toISOString()))throw denied();
 return{email:entry.email,scope:entry.role,owner:false,via:'link'};
}
export function publicAccessEntries(recipients,config){return recipients.map(email=>{const e=config?.entries?.find(e=>e.email===email)||{};return{email,role:e.role||'announcements',method:e.method||'link',hasLink:!!e.tokenHash,expiresAt:e.expiresAt||null}})}

// New reminder recipients get individual announcement links without Google sign-in.
export async function ensureRecipientAccess(store){
 const list=await store.get('settings','email-reminders');const config=await store.get('settings','workspace-access');const recipients=list?.recipients||[];
 const missing=recipients.filter(email=>!config?.entries?.some(e=>e.email===email));
 const incomplete=config?.entries?.some(e=>recipients.includes(e.email)&&e.method==='link'&&e.role!=='blocked'&&!e.token);
 if(!missing.length&&!incomplete&&!(config?.entries||[]).some(e=>!recipients.includes(e.email)))return config;
 const {randomBytes}=await import('node:crypto');
 return store.write('settings','workspace-access',config?.revision||0,old=>({entries:recipients.map(email=>{const entry=old?.entries?.find(e=>e.email===email)||{email,role:'announcements',method:'link'};if(entry.method!=='link'||entry.role==='blocked'||entry.token)return entry;const token='gsa_'+randomBytes(32).toString('base64url');return{...entry,token,tokenHash:accessHash(token)}})}));
}
export function recipientAccessUrl(email,config,frontendUrl){
 const entry=config?.entries?.find(e=>e.email===email);if(!entry||entry.role==='blocked')return null;
 if(entry.method==='link'){if(!entry.token||entry.expiresAt&&entry.expiresAt<=new Date().toISOString())return null;const url=new URL('announcements.html',frontendUrl);url.hash=new URLSearchParams({access:entry.token}).toString();return url.href}
 const url=new URL('login.html',frontendUrl);url.searchParams.set('next',entry.role==='full'?'/':'/announcements.html');url.searchParams.set('email',email);return url.href;
}
