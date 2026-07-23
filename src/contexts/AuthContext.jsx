import { createContext, useContext, useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../config/firebase';

const AuthContext = createContext(null);

const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('email');
googleProvider.addScope('profile');

function getErrorMessage(error) {
  const code = error?.code || '';
  if (code === 'auth/network-request-failed') {
    return 'Network error. Please check your internet connection and try again.';
  }
  if (code === 'auth/user-not-found') {
    return 'No account found with this email address.';
  }
  if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
    return 'Incorrect email or password. Please try again.';
  }
  if (code === 'auth/email-already-in-use') {
    return 'An account with this email already exists.';
  }
  if (code === 'auth/weak-password') {
    return 'Password should be at least 6 characters long.';
  }
  if (code === 'auth/invalid-email') {
    return 'Please enter a valid email address.';
  }
  if (code === 'auth/invalid-api-key' || (error?.message || '').includes('api-key-not-valid')) {
    return 'Firebase API key is invalid. Open RE-AIssistant-v2/.env, set VITE_FIREBASE_API_KEY from Firebase Console (Project settings → Your apps → Web API Key), then restart npm run dev.';
  }
  if (code === 'auth/too-many-requests') {
    return 'Too many failed attempts. Please try again later.';
  }
  if (code === 'auth/popup-closed-by-user') {
    return 'Sign-in popup was closed. Please try again.';
  }
  if (code === 'auth/popup-blocked') {
    return 'Sign-in popup was blocked. Please allow popups for this site.';
  }
  return error?.message || 'An authentication error occurred. Please try again.';
}

function normalizeUserData(userData) {
  if (typeof userData === 'string') {
    return { fullName: userData };
  }
  return userData || {};
}

function buildUserProfile(email, profile) {
  const now = new Date();
  return {
    fullName: profile.fullName || '',
    email,
    createdAt: now,
    role: profile.role || 'agent',
    licenseNumber: profile.licenseNumber || '',
    company: profile.company || '',
    phone: profile.phone || '',
    emailVerified: false,
    subscription: {
      plan: 'trial',
      status: 'active',
      startDate: now,
      endDate: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
    },
  };
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        try {
          const snap = await getDoc(doc(db, 'users', user.uid));
          setUserProfile(snap.exists() ? snap.data() : null);
        } catch (error) {
          console.warn('Firebase profile fetch failed:', error.message);
          setUserProfile(null);
        }
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  async function signup(email, password, userData) {
    setAuthError(null);
    const profile = normalizeUserData(userData);

    try {
      const result = await createUserWithEmailAndPassword(auth, email, password);

      if (profile.fullName) {
        await updateProfile(result.user, { displayName: profile.fullName });
      }

      await sendEmailVerification(result.user);

      await setDoc(doc(db, 'users', result.user.uid), buildUserProfile(email, profile));

      return result;
    } catch (error) {
      const message = getErrorMessage(error);
      setAuthError(message);
      console.error('Signup error:', error);
      throw new Error(message);
    }
  }

  async function login(email, password) {
    setAuthError(null);

    try {
      return await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      const message = getErrorMessage(error);
      setAuthError(message);
      console.error('Login error:', error);
      throw new Error(message);
    }
  }

  async function googleSignIn() {
    setAuthError(null);

    try {
      const result = await signInWithPopup(auth, googleProvider);
      const userDoc = await getDoc(doc(db, 'users', result.user.uid));

      if (!userDoc.exists()) {
        const profile = {
          ...buildUserProfile(result.user.email, { fullName: result.user.displayName || '' }),
          emailVerified: result.user.emailVerified,
        };
        await setDoc(doc(db, 'users', result.user.uid), profile);
        setUserProfile(profile);
      } else {
        setUserProfile(userDoc.data());
      }

      return result;
    } catch (error) {
      const message = getErrorMessage(error);
      setAuthError(message);
      console.error('Google sign-in error:', error);
      throw new Error(message);
    }
  }

  async function logout() {
    setAuthError(null);
    try {
      await signOut(auth);
      setCurrentUser(null);
      setUserProfile(null);
    } catch (error) {
      const message = getErrorMessage(error);
      setAuthError(message);
      console.error('Logout error:', error);
      throw new Error(message);
    }
  }

  async function resetPassword(email) {
    setAuthError(null);
    try {
      return await sendPasswordResetEmail(auth, email);
    } catch (error) {
      const message = getErrorMessage(error);
      setAuthError(message);
      console.error('Password reset error:', error);
      throw new Error(message);
    }
  }

  async function sendVerificationEmail() {
    setAuthError(null);
    try {
      if (currentUser && !currentUser.emailVerified) {
        return await sendEmailVerification(currentUser);
      }
    } catch (error) {
      const message = getErrorMessage(error);
      setAuthError(message);
      console.error('Email verification error:', error);
      throw new Error(message);
    }
  }

  async function updateUserProfile(uid, data) {
    setAuthError(null);
    try {
      await updateDoc(doc(db, 'users', uid), data);
      setUserProfile((prev) => ({ ...(prev || {}), ...data }));
    } catch (error) {
      const message = getErrorMessage(error);
      setAuthError(message);
      console.error('Profile update error:', error);
      throw new Error(message);
    }
  }

  const value = {
    currentUser,
    userProfile,
    loading,
    authError,
    signup,
    login,
    googleSignIn,
    logout,
    resetPassword,
    sendVerificationEmail,
    updateUserProfile,
    setAuthError,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
