import { initializeApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  getAuth,
  getMultiFactorResolver,
  getRedirectResult,
  GoogleAuthProvider,
  multiFactor,
  onAuthStateChanged,
  PhoneMultiFactorGenerator,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updateProfile,
  type MultiFactorError,
  type MultiFactorInfo,
  type MultiFactorResolver,
  type PhoneMultiFactorInfo,
  type User,
} from "firebase/auth";

import { resolveFirebaseClientConfig } from './firebase-config'

export const isLocalDevelopment =
  process.env.NEXT_PUBLIC_APP_ENV === 'local' ||
  (!process.env.NEXT_PUBLIC_APP_ENV && process.env.NODE_ENV === 'development');

const resolvedFirebaseConfig = resolveFirebaseClientConfig({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || (isLocalDevelopment ? 'local-api-key' : undefined),
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || (isLocalDevelopment ? 'localhost' : undefined),
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || (isLocalDevelopment ? 'cpaautomation-local' : undefined),
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || (isLocalDevelopment ? 'local-app-id' : undefined),
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
})

export const isFirebaseConfigured = resolvedFirebaseConfig.isConfigured

export const requireFirebaseConfiguration = () => {
  if (!isFirebaseConfigured) {
    throw new Error(
      `Firebase authentication is not configured. Missing: ${resolvedFirebaseConfig.missingVariables.join(', ')}`,
    )
  }
}

export const firebaseApp = initializeApp(resolvedFirebaseConfig.config);
export const auth = getAuth(firebaseApp);
export const googleProvider = new GoogleAuthProvider();

const localUser = {
  uid: 'local-developer',
  email: 'local.developer@example.com',
  displayName: 'Local Developer',
  photoURL: null,
  phoneNumber: null,
  emailVerified: true,
  isAnonymous: false,
  providerId: 'local',
  providerData: [],
  metadata: {},
  tenantId: null,
  refreshToken: 'local',
  delete: async () => undefined,
  getIdToken: async () => 'cpaautomation-local-development',
  getIdTokenResult: async () => ({ token: 'cpaautomation-local-development', claims: {}, authTime: '', issuedAtTime: '', expirationTime: '', signInProvider: null, signInSecondFactor: null }),
  reload: async () => undefined,
  toJSON: () => ({ uid: 'local-developer', email: 'local.developer@example.com' }),
} as unknown as User;

export const getCurrentAuthUser = (): User | null => {
  if (isLocalDevelopment) return localUser
  if (!isFirebaseConfigured) return null
  return auth.currentUser
}

export const getCurrentAuthToken = async (): Promise<string | null> => {
  const user = getCurrentAuthUser();
  return user ? user.getIdToken() : null;
};

// Configure Google provider
googleProvider.addScope('email');
googleProvider.addScope('profile');
// Always show the account chooser, once, rather than relying on Google's
// implicit behavior. This keeps the picker deterministic across sessions.
googleProvider.setCustomParameters({ prompt: 'select_account' });

// signInWithPopup does not reliably settle when the user dismisses the Google
// account-chooser popup: in some browser/COOP configurations the opener loses
// its handle to the popup window, so Firebase's internal "did it close?" poll
// never fires and the returned promise hangs forever. That leaves the caller's
// loading state stuck until a full page refresh. To recover, we watch for the
// opener window regaining focus (which only happens once the popup closes) and,
// after a short grace period for a genuine result to arrive, reject with the
// standard popup-closed code so the handling in signInWithGoogle can take over.
const POPUP_CLOSED_GRACE_MS = 1000;

const signInWithGooglePopup = (): Promise<Awaited<ReturnType<typeof signInWithPopup>>> => {
  requireFirebaseConfiguration()
  const popupPromise = signInWithPopup(auth, googleProvider);

  // Without a window (SSR) there is nothing to watch — defer entirely to Firebase.
  if (typeof window === 'undefined') {
    return popupPromise;
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let graceTimer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      window.removeEventListener('focus', onFocus);
      if (graceTimer) {
        clearTimeout(graceTimer);
        graceTimer = null;
      }
    };

    const settle = (action: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      action();
    };

    const onFocus = () => {
      // The app regains focus only once the popup has closed. Give Firebase a
      // brief window to deliver a genuine sign-in result before assuming the
      // user dismissed the popup. If a result (or error) arrives first, the
      // settle() guard ensures this timer is a no-op.
      if (graceTimer) return;
      graceTimer = setTimeout(() => {
        settle(() => reject(Object.assign(new Error('Popup closed by user.'), {
          code: 'auth/popup-closed-by-user',
        })));
      }, POPUP_CLOSED_GRACE_MS);
    };

    window.addEventListener('focus', onFocus);

    popupPromise.then(
      (result) => settle(() => resolve(result)),
      (error) => settle(() => reject(error)),
    );
  });
};

// Sign in with Google. We prefer the popup flow, but a failed or cancelled popup must
// NEVER silently fall back into a second account-selection prompt. We only fall back to
// a full-page redirect when the popup genuinely could not open.
export const signInWithGoogle = async () => {
  if (isLocalDevelopment) return { user: localUser };
  console.log('Initiating Google sign-in popup...');
  try {
    const result = await signInWithGooglePopup();
    console.log('Popup sign-in successful:', result.user.email);
    return result;
  } catch (error) {
    const code = (error as { code?: string })?.code;
    console.error('Popup sign-in error:', code, error);

    // The user dismissed the popup themselves — do not re-prompt.
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      return null;
    }

    // MFA challenge must be resolved by the caller, not swallowed here.
    if (isMultiFactorAuthRequiredError(error)) {
      throw error;
    }

    // The popup genuinely could not be opened (blocked / unsupported environment).
    // Only here do we fall back to a single redirect-based sign-in.
    if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-environment') {
      console.log('Popup unavailable, falling back to redirect...');
      return signInWithRedirect(auth, googleProvider);
    }

    throw error;
  }
};

// Handle redirect result
export const handleRedirectResult = () => {
  if (isLocalDevelopment) return Promise.resolve(null);
  if (!isFirebaseConfigured) return Promise.resolve(null);
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
  if (isLocalDevelopment) return Promise.resolve();
  if (!isFirebaseConfigured) return Promise.resolve();
  return signOut(auth);
};

// Email/password authentication
export const signUpWithEmail = (email: string, password: string) => {
  if (isLocalDevelopment) return Promise.resolve({ user: localUser });
  requireFirebaseConfiguration()
  console.log('Creating account with email:', email);
  return createUserWithEmailAndPassword(auth, email, password);
};

// Update user profile
export const updateUserProfile = (user: any, profile: { displayName?: string; photoURL?: string }) => {
  if (isLocalDevelopment) {
    Object.assign(user, profile);
    return Promise.resolve();
  }
  requireFirebaseConfiguration()
  return updateProfile(user, profile);
};

export const signInWithEmail = (email: string, password: string) => {
  if (isLocalDevelopment) return Promise.resolve({ user: localUser });
  requireFirebaseConfiguration()
  console.log('Signing in with email:', email);
  return signInWithEmailAndPassword(auth, email, password);
};

export const sendVerificationEmailToUser = (user: User) => {
  if (isLocalDevelopment) return Promise.resolve()
  requireFirebaseConfiguration()
  return sendEmailVerification(user)
}

export const isPhoneMultiFactorInfo = (factor: MultiFactorInfo): factor is PhoneMultiFactorInfo => {
  return factor.factorId === PhoneMultiFactorGenerator.FACTOR_ID
}

export const getEnrolledPhoneMfaFactors = (user: User | null | undefined): PhoneMultiFactorInfo[] => {
  if (!user) {
    return []
  }

  return multiFactor(user).enrolledFactors.filter(isPhoneMultiFactorInfo)
}

export const hasEnrolledPhoneMfa = (user: User | null | undefined) => {
  if (isLocalDevelopment) return true
  return getEnrolledPhoneMfaFactors(user).length > 0
}

export const isMultiFactorAuthRequiredError = (error: unknown) => {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'auth/multi-factor-auth-required'
}

export const getPhoneMfaResolver = (error: unknown): MultiFactorResolver => {
  requireFirebaseConfiguration()
  return getMultiFactorResolver(auth, error as MultiFactorError)
}

export const getPreferredPhoneMfaHint = (resolver: MultiFactorResolver): PhoneMultiFactorInfo | null => {
  return resolver.hints.find(isPhoneMultiFactorInfo) ?? null
}

// Auth state observer
export const onAuthStateChange = (callback: (user: any) => void) => {
  if (isLocalDevelopment) {
    queueMicrotask(() => callback(localUser));
    return () => undefined;
  }
  if (!isFirebaseConfigured) {
    queueMicrotask(() => callback(null));
    return () => undefined;
  }
  return onAuthStateChanged(auth, callback);
};
