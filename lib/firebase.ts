import { initializeApp } from "firebase/app";
import { getAuth, signInWithRedirect, signInWithPopup, getRedirectResult, GoogleAuthProvider, signOut, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebaseapp.com`,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebasestorage.app`,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

console.log('Firebase config loaded:', {
  hasApiKey: !!firebaseConfig.apiKey,
  hasProjectId: !!firebaseConfig.projectId,
  hasAppId: !!firebaseConfig.appId,
  authDomain: firebaseConfig.authDomain
});

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Configure Google provider
googleProvider.addScope('email');
googleProvider.addScope('profile');

// Sign in with Google popup (more reliable for development)
export const signInWithGoogle = () => {
  console.log('Initiating Google sign-in popup...');
  return signInWithPopup(auth, googleProvider).then((result) => {
    console.log('Popup sign-in successful:', result.user.email);
    return result;
  }).catch((error) => {
    console.error('Popup sign-in error:', error);
    // Fallback to redirect if popup is blocked
    console.log('Falling back to redirect method...');
    return signInWithRedirect(auth, googleProvider);
  });
};

// Handle redirect result
export const handleRedirectResult = () => {
  console.log('Checking for redirect result...');
  return getRedirectResult(auth).then((result) => {
    console.log('Redirect result received:', result);
    return result;
  }).catch((error) => {
    console.error('Redirect result error:', error);
    throw error;
  });
};

// Sign out
export const signOutUser = () => {
  return signOut(auth);
};

// Email/password authentication
export const signUpWithEmail = (email: string, password: string) => {
  console.log('Creating account with email:', email);
  return createUserWithEmailAndPassword(auth, email, password);
};

// Update user profile
export const updateUserProfile = (user: any, profile: { displayName?: string; photoURL?: string }) => {
  return updateProfile(user, profile);
};

export const signInWithEmail = (email: string, password: string) => {
  console.log('Signing in with email:', email);
  return signInWithEmailAndPassword(auth, email, password);
};

// Auth state observer
export const onAuthStateChange = (callback: (user: any) => void) => {
  return onAuthStateChanged(auth, callback);
};