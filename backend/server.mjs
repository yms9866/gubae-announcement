import {accessForEmail,ensureRecipientAccess} from './access.mjs';
import {runTeacherAssignmentFile} from './assign-teachers.mjs';
import {ensureSignInDomain} from './auth-domain.mjs';
import{readFile}from'node:fs/promises';
import{initializeApp,cert,applicationDefault}from'firebase-admin/app';
import{getFirestore}from'firebase-admin/firestore';
import{getAuth}from'firebase-admin/auth';
import{createApp}from'./app.mjs';
import{FirestoreStore}from'./store.mjs';
const projectId=process.env.FIREBASE_PROJECT_ID;
const publicAccess=false;
const admins=new Set((process.env.ADMIN_EMAILS||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean));
if(!projectId||(!publicAccess&&!admins.size))throw Error('Set FIREBASE_PROJECT_ID and ADMIN_EMAILS before starting the API.');
const webConfig=JSON.parse(process.env.FIREBASE_WEB_CONFIG_JSON||'{}');
if(!publicAccess&&(!webConfig.apiKey||!webConfig.authDomain||webConfig.projectId!==projectId))throw Error('Set a matching FIREBASE_WEB_CONFIG_JSON from the Firebase Web app configuration.');
const credentials=process.env.FIREBASE_SERVICE_ACCOUNT_JSON?cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)):applicationDefault();
initializeApp({projectId,credential:credentials});const store=new FirestoreStore(getFirestore());
// Startup maintenance must not crash-loop the service (and re-read Firestore) when the database is unavailable.
const startupTask=async(name,task)=>{try{return await task()}catch(e){console.warn('Startup task skipped: '+JSON.stringify({task:name,status:e.status||500,code:e.code??e.name??'unknown'}));return null}};
await startupTask('seed',async()=>store.seed(JSON.parse(await readFile(new URL('../dist/meetings.json',import.meta.url),'utf8'))));
await startupTask('recipient-access',()=>ensureRecipientAccess(store));
const assignmentResult=await startupTask('teacher-assignments',()=>runTeacherAssignmentFile(store,new URL('./data/teacher-assignments-2026-10.json',import.meta.url),{apply:true}));
if(assignmentResult)console.log('Teacher assignment import: '+JSON.stringify(assignmentResult.counts));
const origins=(process.env.ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean);
const frontendUrl=process.env.FRONTEND_URL;if(!frontendUrl||!origins.includes(new URL(frontendUrl).origin))throw Error('Set FRONTEND_URL and include its origin in ALLOWED_ORIGINS.');
let signInDomainReady=false;try{signInDomainReady=await ensureSignInDomain({projectId,frontendUrl,credentials});console.log('Google sign-in domain ready.');}catch{console.warn('Google sign-in domain check needs attention.');}
const authorize=user=>accessForEmail(store,user,admins);
const app=createApp({createSessionCookie:token=>getAuth().createSessionCookie(token,{expiresIn:5*86400000}),verifySessionCookie:async cookie=>authorize(await getAuth().verifySessionCookie(cookie,true)),store,publicAccess,webConfig,signInDomainReady,origins,frontendUrl,verifyAdmin:async token=>{const user=await getAuth().verifyIdToken(token,true);return authorize(user);}});
// Render terminates HTTPS at its proxy; trust exactly the immediate proxy.
app.set('trust proxy',1);app.listen(Number(process.env.PORT)||10000,'0.0.0.0',()=>console.log('Gubae API ready.'));
