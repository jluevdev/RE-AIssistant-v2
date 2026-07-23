import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import { getStorage } from 'firebase/storage';
import { getFirebaseConfig } from './env';

const firebaseConfig = getFirebaseConfig();

if (!firebaseConfig) {
  throw new Error('Firebase is not configured. Check .env and restart the dev server.');
}

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app, 'us-central1');
const storage = getStorage(app);

export { auth, db, functions, storage };
export default app;
