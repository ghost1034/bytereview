'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { User } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { auth, hasVerifiedPhone, signInWithGoogle, signOutUser, handleRedirectResult, onAuthStateChange, signInWithEmail, signUpWithEmail, updateUserProfile } from '@/lib/firebase';
import { buildPhoneVerificationRedirect, normalizeAuthRedirectPath } from '@/lib/auth-redirect';

const POST_AUTH_REDIRECT_STORAGE_KEY = 'post-auth-redirect'

interface AuthContextType {
  user: User | null;
  loading: boolean;
  requiresPhoneVerification: boolean;
  signIn: (redirectTo?: string) => Promise<void>;
  signInWithEmailAndPassword: (email: string, password: string, redirectTo?: string) => Promise<void>;
  signUpWithEmailAndPassword: (email: string, password: string, displayName?: string) => Promise<void>;
  completePhoneVerification: (redirectTo?: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const persistRedirectTarget = useCallback((redirectTo?: string) => {
    if (typeof window === 'undefined') {
      return
    }

    sessionStorage.setItem(
      POST_AUTH_REDIRECT_STORAGE_KEY,
      normalizeAuthRedirectPath(redirectTo),
    )
  }, [])

  const consumeRedirectTarget = useCallback(() => {
    if (typeof window === 'undefined') {
      return undefined
    }

    const storedRedirect = sessionStorage.getItem(POST_AUTH_REDIRECT_STORAGE_KEY)
    sessionStorage.removeItem(POST_AUTH_REDIRECT_STORAGE_KEY)
    return storedRedirect || undefined
  }, [])

  const navigateAfterAuthentication = useCallback((firebaseUser: User, redirectTo?: string) => {
    const destination = hasVerifiedPhone(firebaseUser)
      ? normalizeAuthRedirectPath(redirectTo)
      : buildPhoneVerificationRedirect(redirectTo);

    router.push(destination);
  }, [router]);

  useEffect(() => {
    const unsubscribe = onAuthStateChange((firebaseUser) => {
      console.log('Auth state changed:', {
        newUser: firebaseUser?.email,
        hasVerifiedPhone: hasVerifiedPhone(firebaseUser),
      });

      setUser(firebaseUser);
      setLoading(false);
    });

    handleRedirectResult()
      .then((result) => {
        if (result?.user) {
          console.log('Redirect result processed, routing authenticated user');
          setUser(result.user);
          navigateAfterAuthentication(result.user, consumeRedirectTarget());
        }
      })
      .catch((error) => {
        console.error('Firebase redirect error:', error);
      });

    return () => unsubscribe();
  }, [consumeRedirectTarget, navigateAfterAuthentication]);

  const signIn = async (redirectTo?: string) => {
    try {
      persistRedirectTarget(redirectTo)
      const result = await signInWithGoogle();
      if (result && result.user) {
        console.log('Google sign-in successful, routing user');
        setUser(result.user);
        consumeRedirectTarget()
        navigateAfterAuthentication(result.user, redirectTo);
      }
    } catch (error) {
      consumeRedirectTarget()
      console.error('Sign in error:', error);
      throw error;
    }
  };

  const signInWithEmailAndPassword = async (email: string, password: string, redirectTo?: string) => {
    try {
      const result = await signInWithEmail(email, password);
      if (result && result.user) {
        console.log('Email sign-in successful, routing user');
        setUser(result.user);
        consumeRedirectTarget()
        navigateAfterAuthentication(result.user, redirectTo);
      }
    } catch (error) {
      console.error('Email sign in error:', error);
      throw error;
    }
  };

  const signUpWithEmailAndPassword = async (email: string, password: string, displayName?: string) => {
    try {
      const result = await signUpWithEmail(email, password);
      if (result && result.user) {
        // Update display name if provided
        if (displayName) {
          await updateUserProfile(result.user, { displayName });
        }
        
        console.log('Email sign-up successful, awaiting phone verification');
        await result.user.reload();
        setUser(result.user);
      }
    } catch (error) {
      console.error('Email sign up error:', error);
      throw error;
    }
  };

  const completePhoneVerification = useCallback(async (redirectTo?: string) => {
    const currentUser = auth.currentUser;

    if (!currentUser) {
      throw new Error('Please sign in again to continue.');
    }

    await currentUser.reload();
    await currentUser.getIdToken(true);

    const refreshedUser = auth.currentUser;
    if (!refreshedUser || !hasVerifiedPhone(refreshedUser)) {
      throw new Error('Phone verification is not complete yet.');
    }

    setUser(refreshedUser);
    router.push(normalizeAuthRedirectPath(redirectTo));
  }, [router]);

  const signOut = async () => {
    try {
      await signOutUser();
      setUser(null);
      // Redirect to home page after sign out
      router.push('/');
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  const value = useMemo(() => ({
    user,
    loading,
    requiresPhoneVerification: !!user && !hasVerifiedPhone(user),
    signIn,
    signInWithEmailAndPassword,
    signUpWithEmailAndPassword,
    completePhoneVerification,
    signOut,
  }), [completePhoneVerification, loading, signIn, signInWithEmailAndPassword, signOut, signUpWithEmailAndPassword, user]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
