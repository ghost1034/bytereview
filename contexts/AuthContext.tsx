'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { auth, signInWithGoogle, signOutUser, handleRedirectResult, onAuthStateChange, signInWithEmail, signUpWithEmail, updateUserProfile } from '@/lib/firebase';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: () => Promise<void>;
  signInWithEmailAndPassword: (email: string, password: string) => Promise<void>;
  signUpWithEmailAndPassword: (email: string, password: string, displayName?: string) => Promise<void>;
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
  const [hasRedirected, setHasRedirected] = useState(false);

  useEffect(() => {
    // Set up auth state listener
    const unsubscribe = onAuthStateChange(async (firebaseUser) => {
      console.log('Auth state changed:', { 
        previousUser: user?.email, 
        newUser: firebaseUser?.email, 
        hasRedirected 
      });
      
      const wasSignedIn = !user && firebaseUser;
      
      setUser(firebaseUser);
      setLoading(false);
      
      // Removed sync logic - now handled by React Query in useUserProfile hook
      
      // Don't auto-redirect - let components handle their own redirect logic
      if (wasSignedIn && !hasRedirected) {
        console.log('User signed in, but not auto-redirecting');
        setHasRedirected(true);
      }
    });

    // Also handle redirect result
    handleRedirectResult()
      .then((result) => {
        console.log('Redirect result:', { result, hasRedirected });
        if (result && result.user && !hasRedirected) {
          console.log('Redirect result processed, but not auto-redirecting');
          setHasRedirected(true);
        }
      })
      .catch((error) => {
        console.error('Firebase redirect error:', error);
      });

    return () => unsubscribe();
  }, [router, user, hasRedirected]);

  const signIn = async () => {
    try {
      const result = await signInWithGoogle();
      if (result && result.user) {
        console.log('Google sign-in successful, redirecting to dashboard');
        setUser(result.user);
        setHasRedirected(true);
        router.push('/dashboard');
      }
    } catch (error) {
      console.error('Sign in error:', error);
    }
  };

  const signInWithEmailAndPassword = async (email: string, password: string) => {
    try {
      const result = await signInWithEmail(email, password);
      if (result && result.user) {
        console.log('Email sign-in successful, redirecting to dashboard');
        setUser(result.user);
        setHasRedirected(true);
        router.push('/dashboard');
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
        
        console.log('Email sign-up successful, redirecting to dashboard');
        setUser(result.user);
        setHasRedirected(true);
        router.push('/dashboard');
      }
    } catch (error) {
      console.error('Email sign up error:', error);
      throw error;
    }
  };

  const signOut = async () => {
    try {
      await signOutUser();
      setUser(null);
      setHasRedirected(false);
      // Redirect to home page after sign out
      router.push('/');
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  const value = {
    user,
    loading,
    signIn,
    signInWithEmailAndPassword,
    signUpWithEmailAndPassword,
    signOut,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}