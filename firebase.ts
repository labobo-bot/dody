import { initializeApp } from 'firebase/app';
import { initializeAuth, browserPopupRedirectResolver, indexedDBLocalPersistence, GoogleAuthProvider } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';
import { getDatabase } from 'firebase/database';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

// More robust programmatic initialization for Auth
export const auth = initializeAuth(app, {
  persistence: indexedDBLocalPersistence,
  popupRedirectResolver: browserPopupRedirectResolver,
});

export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true
}, firebaseConfig.firestoreDatabaseId);

export const rtdb = getDatabase(app, (firebaseConfig as any).databaseURL || `https://${firebaseConfig.projectId}-default-rtdb.firebaseio.com`);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  'prompt': 'select_account'
});
