import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

// The app will break without specifying the base database ID if multiple are used, 
// but here we use the one from config.
export const db = getFirestore(app);
export const auth = getAuth(app);

export default app;
