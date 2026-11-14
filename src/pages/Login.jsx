import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { User } from '@/api/entities';
import { Stethoscope, Loader } from 'lucide-react';
import { localClient } from '@/api/localClient';
import { useEffect, useRef } from 'react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isForgot, setIsForgot] = useState(false);
  const [info, setInfo] = useState('');
  const [showContinue, setShowContinue] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const googleButtonRef = useRef(null);

  // Opened from the "Confirm my email" link sent to admin/senior addresses
  useEffect(() => {
    const token = searchParams.get('confirm');
    if (!token) return;
    setSearchParams({}, { replace: true });
    localClient
      .confirmEmail(token)
      .then((result) => {
        setInfo(`Your email is confirmed and your ${result.role} access is on.` + (localClient.token ? '' : ' Sign in to continue.'));
        setShowContinue(!!localClient.token);
      })
      .catch((e) => setError(e.message || 'This link is no longer valid.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const switchMode = (mode) => {
    setIsRegister(mode === 'register');
    setIsForgot(mode === 'forgot');
    setError('');
    setInfo('');
  };

  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId || !googleButtonRef.current) {
      console.log('Google Sign-In: Missing client ID or button ref');
      return;
    }

    // Function to initialize Google Sign-In
    const initializeGoogleSignIn = () => {
      if (!window.google || !window.google.accounts) {
        console.log('Google Sign-In: Script not loaded yet, retrying...');
        return false;
      }

      try {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: async (response) => {
            setIsLoading(true);
            setError('');
            try {
              if (!response || !response.credential) {
                throw new Error('Google sign-in failed: No credential received');
              }
              await localClient.googleLogin(response.credential);
              navigate('/dashboard');
            } catch (e) {
              // Extract meaningful error message
              let errorMessage = e.message || 'Google sign-in failed';
              
              // Handle network errors
              if (e.status === 0 || e.name === 'TypeError') {
                errorMessage = 'Network error: Please check your internet connection and try again.';
              } else if (e.status === 400) {
                errorMessage = e.message || 'Google sign-in failed. Please try again.';
              } else if (e.status === 500) {
                errorMessage = 'Server error during Google sign-in. Please try again later.';
              } else if (errorMessage.startsWith('HTTP ')) {
                errorMessage = 'Google sign-in failed. Please try again.';
              }
              
              setError(errorMessage);
            } finally {
              setIsLoading(false);
            }
          },
        });
        window.google.accounts.id.renderButton(googleButtonRef.current, {
          theme: 'outline',
          size: 'large',
          width: '100%', // Use 100% width for better mobile compatibility
          text: 'signin_with', // Use standard sign-in text
          locale: 'en',
        });
        console.log('Google Sign-In: Button rendered successfully');
        return true;
      } catch (e) {
        console.error('Google Sign-In initialization error:', e);
        return false;
      }
    };

    // Try to initialize immediately
    if (initializeGoogleSignIn()) {
      return;
    }

    // If Google script hasn't loaded yet, wait for it
    const checkInterval = setInterval(() => {
      if (initializeGoogleSignIn()) {
        clearInterval(checkInterval);
      }
    }, 100);

    // Cleanup: stop checking after 10 seconds
    const timeout = setTimeout(() => {
      clearInterval(checkInterval);
      if (!window.google) {
        console.warn('Google Sign-In: Script failed to load after 10 seconds');
      }
    }, 10000);

    return () => {
      clearInterval(checkInterval);
      clearTimeout(timeout);
    };
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setInfo('');

    try {
      if (isForgot) {
        const result = await localClient.forgotPassword(email);
        setInfo(result.message);
        return;
      }
      if (isRegister) {
        const result = await User.register(email, password, fullName || email.split('@')[0]);
        if (result?.needs_email_confirmation) {
          // Admin/senior address: that access turns on once the emailed link is clicked
          setInfo(result.confirmation_sent
            ? `Your account is ready. Because this address has special access, we've emailed a confirmation link to ${email.trim()}. That access turns on after you click it; you can already use the site.`
            : 'Your account is ready. We couldn\'t send the confirmation email for your special access just now. Sign in with the Google button, or use "Forgot password?" later to get a link.');
          setShowContinue(true);
          return;
        }
      } else {
        await User.login(email, password);
      }
      navigate('/dashboard');
    } catch (error) {
      // Extract meaningful error message
      let errorMessage = error.message;
      const code = error.data?.code;

      if (code === 'recreate_account') {
        // Had an account before the site was updated: create it again once
        switchMode('register');
        setInfo(error.message);
        return;
      }

      // Handle network errors
      if (error.status === 0 || error.name === 'TypeError') {
        errorMessage = 'Network error: Please check your internet connection and try again.';
      } else if (code) {
        // The server explains what to do (e.g. a Google account, sign-ups paused)
        errorMessage = error.message;
      } else if (error.status === 400) {
        // Use the error message from the API response
        errorMessage = error.message || (isRegister ? 'Registration failed. Please check your information.' : 'Login failed. Please check your credentials.');
      } else if (error.status === 401) {
        errorMessage = 'Invalid email or password. Please try again.';
      } else if (error.status === 500) {
        errorMessage = 'Server error. Please try again later.';
      } else if (!errorMessage || errorMessage.startsWith('HTTP ')) {
        // Fallback for generic HTTP errors
        errorMessage = isRegister ? 'Registration failed. Please try again.' : 'Login failed. Please check your credentials and try again.';
      }
      
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };


  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="flex justify-center">
            <Stethoscope className="h-12 w-12 text-blue-600" />
          </div>
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
            Medical Dashboard
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Sign in to access your medical studies dashboard
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{isForgot ? 'Forgot password' : isRegister ? 'Create account' : 'Sign In'}</CardTitle>
            <CardDescription>
              {isForgot
                ? "Enter your email and we'll send you a link to choose a new password."
                : 'Enter your credentials to access the dashboard'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {showContinue ? (
              <div className="space-y-4">
                <Alert className="border-blue-200 bg-blue-50">
                  <AlertDescription className="text-blue-900">{info}</AlertDescription>
                </Alert>
                <Button className="w-full" onClick={() => navigate('/dashboard')}>
                  Continue to the dashboard
                </Button>
              </div>
            ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              {info && (
                <Alert className="border-blue-200 bg-blue-50">
                  <AlertDescription className="text-blue-900">{info}</AlertDescription>
                </Alert>
              )}

              {isRegister && (
                <div>
                  <label htmlFor="fullName" className="block text-sm font-medium text-gray-700">
                    Full name
                  </label>
                  <Input
                    id="fullName"
                    name="fullName"
                    type="text"
                    autoComplete="name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="mt-1"
                    placeholder="Enter your full name"
                  />
                </div>
              )}

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                  Email address
                </label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1"
                  placeholder="Enter your email"
                />
              </div>

              {!isForgot && (
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                    Password
                  </label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete={isRegister ? 'new-password' : 'current-password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="mt-1"
                    placeholder="Enter your password"
                  />
                  {!isRegister && (
                    <div className="text-right mt-1">
                      <button type="button" className="text-sm text-blue-700 hover:underline" onClick={() => switchMode('forgot')} disabled={isLoading}>
                        Forgot password?
                      </button>
                    </div>
                  )}
                </div>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader className="mr-2 h-4 w-4 animate-spin" />
                    {isForgot ? 'Sending...' : isRegister ? 'Creating account...' : 'Signing in...'}
                  </>
                ) : (
                  (isForgot ? 'Email me a link' : isRegister ? 'Create account' : 'Sign in')
                )}
              </Button>
              <div className="text-center text-sm text-gray-600 mt-2">
                {isForgot || isRegister ? (
                  <button type="button" className="underline" onClick={() => switchMode('signin')} disabled={isLoading}>
                    {isForgot ? 'Back to sign in' : 'Already have an account? Sign in'}
                  </button>
                ) : (
                  <button type="button" className="underline" onClick={() => switchMode('register')} disabled={isLoading}>
                    New here? Create an account
                  </button>
                )}
              </div>
            </form>
            )}

            <div className="mt-6">
              <div ref={googleButtonRef} className="flex justify-center mb-4" />
            </div>
          </CardContent>
        </Card>

        <div className="text-center text-sm text-gray-600">
          <p>Or use Google Sign-In above.</p>
        </div>
      </div>
    </div>
  );
}