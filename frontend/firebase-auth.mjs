import {initializeApp} from 'firebase/app';
import {getAuth,GoogleAuthProvider,onAuthStateChanged,signInWithPopup,signInWithRedirect,getRedirectResult,signOut,setPersistence,browserLocalPersistence} from 'firebase/auth';
export async function connectAuth(config,changed){
 const auth=getAuth(initializeApp(config));await setPersistence(auth,browserLocalPersistence);
 await getRedirectResult(auth);
 onAuthStateChanged(auth,changed);
 return {signIn:async()=>{try{await signInWithPopup(auth,new GoogleAuthProvider())}catch(e){if(['auth/popup-blocked','auth/operation-not-supported-in-this-environment'].includes(e.code))await signInWithRedirect(auth,new GoogleAuthProvider());else throw e}},signOut:()=>signOut(auth)};
}
