import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { getFirestore, collection, query, where, onSnapshot, addDoc, serverTimestamp, getDocs, doc, setDoc, deleteDoc, orderBy, limit, increment, getDoc, updateDoc } from 'firebase/firestore';
import { UserData, RatingData, CommentData, NotificationData, LearningPath, SearchLog } from '../types';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Auth Helpers
export const login = () => signInWithPopup(auth, googleProvider);
export const logout = () => signOut(auth);

// Analytics & Gamification
export const logSearch = async (data: SearchLog) => {
  try {
    const path = 'searches';
    await addDoc(collection(db, path), {
      ...data,
      timestamp: serverTimestamp()
    });
  } catch (error) {
    console.warn("Failed to log search", error);
  }
};

export const awardXP = async (userId: string, amount: number) => {
  try {
    const userDocRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userDocRef);
    
    if (userSnap.exists()) {
      const userData = userSnap.data() as UserData;
      const currentXP = userData.xp || 0;
      const newXP = currentXP + amount;
      
      // Basic Level calculation: Level = floor(sqrt(xp / 100)) + 1
      const newLevel = Math.floor(Math.sqrt(newXP / 100)) + 1;
      
      await updateDoc(userDocRef, {
        xp: increment(amount),
        level: newLevel
      });

      // Optional: Check if leveled up to send notification
      const oldLevel = userData.level || 1;
      if (newLevel > oldLevel) {
        await addDoc(collection(db, 'notifications'), {
          userId,
          title: "Novo Nível!",
          message: `Parabéns! Você alcançou o nível ${newLevel}!`,
          isRead: false,
          timestamp: serverTimestamp()
        });
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
  }
};
