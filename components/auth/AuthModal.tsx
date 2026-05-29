'use client'

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Eye, EyeOff, Mail, Lock, User } from "lucide-react";
import { FcGoogle } from "react-icons/fc";
import { useAuth } from "@/contexts/AuthContext";
import PhoneNumberInput from "@/components/auth/PhoneNumberInput";
import { createDefaultPhoneNumberInputValue, getE164PhoneNumber, type PhoneNumberInputValue } from "@/lib/phone-number";
import { isPhoneMfaExemptEmail } from '@/lib/phone-mfa-exempt'
import { apiClient, ApiError } from '@/lib/api'


interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  redirectTo?: string;
  defaultTab?: 'signin' | 'signup';
}

interface SignUpData {
  email: string;
  password: string;
  confirmPassword: string;
  displayName: string;
  phone: PhoneNumberInputValue;
}

function createEmptySignUpData(): SignUpData {
  return {
    email: "",
    password: "",
    confirmPassword: "",
    displayName: "",
    phone: createDefaultPhoneNumberInputValue(),
  };
}

export default function AuthModal({ isOpen, onClose, redirectTo, defaultTab = 'signin' }: AuthModalProps) {
  const { signIn, signInWithEmailAndPassword, signUpWithEmailAndPassword } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  
  // Form states
  const [signInData, setSignInData] = useState({ email: "", password: "" });
  const [signUpData, setSignUpData] = useState<SignUpData>(createEmptySignUpData);

  const resetState = () => {
    setShowPassword(false);
    setIsLoading(false);
    setError("");
    setSignInData({ email: "", password: "" });
    setSignUpData(createEmptySignUpData());
  };

  const closeModal = () => {
    resetState();
    onClose();
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      closeModal();
    }
  };

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setError("");
    try {
      const signedIn = await signIn(redirectTo);
      if (signedIn) {
        closeModal();
      }
      // If the user dismissed the Google popup, keep the modal open so they can
      // retry immediately; the finally block re-enables the button.
    } catch (error: any) {
      setError(error.message || "Failed to sign in with Google");
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    
    try {
      await signInWithEmailAndPassword(signInData.email, signInData.password, redirectTo);
      closeModal();
    } catch (error: any) {
      setError(error.message || "Failed to sign in");
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    const requiresPhoneMfa = !isPhoneMfaExemptEmail(signUpData.email)
    
    if (signUpData.password !== signUpData.confirmPassword) {
      setError("Passwords don't match");
      setIsLoading(false);
      return;
    }

    if (signUpData.password.length < 6) {
      setError("Password must be at least 6 characters");
      setIsLoading(false);
      return;
    }

    let normalizedPhoneNumber: string | undefined
    if (requiresPhoneMfa) {
      normalizedPhoneNumber = getE164PhoneNumber(signUpData.phone) || undefined
      if (!normalizedPhoneNumber) {
        setError("Enter a valid phone number for the selected country");
        setIsLoading(false);
        return;
      }

      try {
        const availability = await apiClient.checkPhoneNumberAvailability(normalizedPhoneNumber)
        if (!availability.available) {
          setError('That phone number is already linked to another account')
          setIsLoading(false)
          return
        }
      } catch (availabilityError) {
        if (availabilityError instanceof ApiError && availabilityError.status === 400) {
          setError(availabilityError.message)
        } else {
          setError('Unable to verify that phone number right now. Please try again.')
        }
        setIsLoading(false)
        return
      }
    }
    
    try {
      await signUpWithEmailAndPassword({
        email: signUpData.email,
        password: signUpData.password,
        displayName: signUpData.displayName,
        phoneNumber: normalizedPhoneNumber,
        redirectTo,
      });
      closeModal();
    } catch (error: any) {
      setError(error.message || "Failed to create account");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center text-2xl font-bold">
            Welcome to CPAAutomation
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          <>
            {/* Google Sign In */}
            <Button
              onClick={handleGoogleSignIn}
              disabled={isLoading}
              variant="outline"
              className="w-full h-12 text-gray-700 border-gray-300 hover:bg-gray-50"
            >
              <FcGoogle className="w-5 h-5 mr-3" />
              Continue with Google
            </Button>

            <div className="relative">
              <Separator />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="bg-white px-2 text-sm text-gray-500">or</span>
              </div>
            </div>

            {/* Email Authentication Tabs */}
            <Tabs defaultValue={defaultTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Sign In</TabsTrigger>
                <TabsTrigger value="signup">Create Account</TabsTrigger>
              </TabsList>

                {/* Sign In Tab */}
                <TabsContent value="signin" className="space-y-4">
                  <form onSubmit={handleEmailSignIn} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="signin-email">Email</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                        <Input
                          id="signin-email"
                          type="email"
                          placeholder="Enter your email"
                          value={signInData.email}
                          onChange={(e) => setSignInData({ ...signInData, email: e.target.value })}
                          className="pl-10"
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="signin-password">Password</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                        <Input
                          id="signin-password"
                          type={showPassword ? "text" : "password"}
                          placeholder="Enter your password"
                          value={signInData.password}
                          onChange={(e) => setSignInData({ ...signInData, password: e.target.value })}
                          className="pl-10 pr-10"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    <Button type="submit" disabled={isLoading} className="w-full">
                      {isLoading ? "Signing In..." : "Sign In"}
                    </Button>
                  </form>
                </TabsContent>

                {/* Sign Up Tab */}
                <TabsContent value="signup" className="space-y-4">
                  <form onSubmit={handleEmailSignUp} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="signup-name">Full Name</Label>
                      <div className="relative">
                        <User className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                        <Input
                          id="signup-name"
                          type="text"
                          placeholder="Enter your full name"
                          value={signUpData.displayName}
                          onChange={(e) => setSignUpData({ ...signUpData, displayName: e.target.value })}
                          className="pl-10"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="signup-email">Email</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                        <Input
                          id="signup-email"
                          type="email"
                          placeholder="Enter your email"
                          value={signUpData.email}
                          onChange={(e) => setSignUpData({ ...signUpData, email: e.target.value })}
                          className="pl-10"
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="signup-phone-preview">Phone Number</Label>
                      <PhoneNumberInput
                        id="signup-phone-preview"
                        value={signUpData.phone}
                        onChange={(phone) => setSignUpData({ ...signUpData, phone })}
                        disabled={isLoading}
                        required={!isPhoneMfaExemptEmail(signUpData.email)}
                      />
                      <p className="text-xs text-gray-500">
                        {isPhoneMfaExemptEmail(signUpData.email)
                          ? 'This account is exempt from SMS sign-in setup.'
                          : 'Choose a country code now and we will use it to prefill your SMS sign-in setup.'}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="signup-password">Password</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                        <Input
                          id="signup-password"
                          type={showPassword ? "text" : "password"}
                          placeholder="Create a password (min. 6 characters)"
                          value={signUpData.password}
                          onChange={(e) => setSignUpData({ ...signUpData, password: e.target.value })}
                          className="pl-10 pr-10"
                          required
                          minLength={6}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="signup-confirm-password">Confirm Password</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                        <Input
                          id="signup-confirm-password"
                          type={showPassword ? "text" : "password"}
                          placeholder="Confirm your password"
                          value={signUpData.confirmPassword}
                          onChange={(e) => setSignUpData({ ...signUpData, confirmPassword: e.target.value })}
                          className="pl-10"
                          required
                        />
                      </div>
                    </div>

                    <Button type="submit" disabled={isLoading} className="w-full">
                      {isLoading ? "Creating Account..." : "Create Account"}
                    </Button>
                  </form>
                </TabsContent>
            </Tabs>
          </>

          {/* Error Message */}
          {error && (
            <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg">
              {error}
            </div>
          )}

          {/* Terms */}
          <p className="text-xs text-gray-500 text-center">
            By continuing, you agree to our{" "}
            <a href="/terms" className="text-blue-600 hover:underline">Terms of Service</a>{" "}
            and{" "}
            <a href="/privacy" className="text-blue-600 hover:underline">Privacy Policy</a>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
