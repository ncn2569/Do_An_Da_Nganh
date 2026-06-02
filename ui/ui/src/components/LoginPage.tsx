import React, { useState } from 'react';
import { Home } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { api } from '../services/api';

interface LoginPageProps {
  onLogin: (user?: { username?: string; email?: string | null; role?: string }) => void;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleSubmit = async () => {
    try {
      if (mode === 'register') {
        await api.register({
          fullName,
          email,
          password,
        });
        alert('Register successful!');
        setMode('login');
      } else {
        const response = await api.login(email || username, password);
        localStorage.setItem('authToken', response.data.accessToken || response.data.token);
        onLogin(response.data?.user);
      }
    } catch (error: any) {
      alert('Login failed: ' + (error.response?.data?.error || error.response?.data?.message || error.message));
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-10 selection:bg-blue-100 selection:text-blue-900">
      <Card className="w-full max-w-md border-0 shadow-xl shadow-slate-200/60 rounded-2xl bg-white overflow-hidden">
        <CardHeader className="text-center px-8 pt-12 pb-6">
          {/* Logo Icon */}
          <div className="mx-auto w-14 h-14 bg-blue-50 text-[#0033CC] rounded-2xl flex items-center justify-center mb-6 shadow-inner">
            <Home className="w-7 h-7" />
          </div>
          
          <CardTitle className="text-2xl font-bold text-slate-900 tracking-tight">
            Projekt SkyNet: Home Edition
          </CardTitle>
          <p className="text-sm text-slate-500 mt-2 font-medium">
            {mode === 'login'
              ? 'Welcome back to your smart home'
              : 'Create an account to manage your home'}
          </p>
        </CardHeader>

        <CardContent className="space-y-6 px-8 pb-12">
          <div className="space-y-5">
            {mode === 'register' && (
              <div className="space-y-2">
                <Label htmlFor="register-fullname" className="text-slate-700 font-medium">Full name</Label>
                <Input
                  id="register-fullname"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  placeholder="Nguyễn Văn A"
                  className="h-11 bg-slate-50/50 focus-visible:ring-blue-600 focus-visible:ring-offset-0 border-slate-200"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="login-username" className="text-slate-700 font-medium">
                {mode === 'login' ? 'Username / Email' : 'Email address'}
              </Label>
              <Input
                id="login-username"
                value={mode === 'login' ? username : email}
                onChange={(event) => (mode === 'login' ? setUsername(event.target.value) : setEmail(event.target.value))}
                placeholder={mode === 'login' ? 'khang@yolohome.com' : 'you@example.com'}
                className="h-11 bg-slate-50/50 focus-visible:ring-blue-600 focus-visible:ring-offset-0 border-slate-200"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="login-password" className="text-slate-700 font-medium">Password</Label>
                {mode === 'login' && (
                  <button type="button" className="text-xs font-semibold text-[#0033CC] hover:text-blue-800 transition-colors">
                    Forgot password?
                  </button>
                )}
              </div>
              <Input
                id="login-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                className="h-11 bg-slate-50/50 focus-visible:ring-blue-600 focus-visible:ring-offset-0 border-slate-200"
              />
            </div>

            {mode === 'register' && (
              <div className="space-y-2">
                <Label htmlFor="register-password-confirm" className="text-slate-700 font-medium">Confirm password</Label>
                <Input
                  id="register-password-confirm"
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="••••••••"
                  className="h-11 bg-slate-50/50 focus-visible:ring-blue-600 focus-visible:ring-offset-0 border-slate-200"
                />
              </div>
            )}
          </div>

          <div className="space-y-3 pt-2">
            <Button
              className="w-full h-11 text-base font-semibold bg-[#0033CC] text-white hover:bg-[#0027a3] hover:shadow-md transition-all duration-200"
              onClick={handleSubmit}
            >
              {mode === 'login' ? 'Sign In' : 'Create Account'}
            </Button>


          </div>

          <div className="text-center text-sm text-slate-500 pt-4 border-t border-slate-100">
            {mode === 'login' ? (
              <p>
                New here?{' '}
                <button type="button" className="font-semibold text-[#0033CC] hover:text-blue-800 transition-colors" onClick={() => setMode('register')}>
                  Create an account
                </button>
              </p>
            ) : (
              <p>
                Already have an account?{' '}
                <button type="button" className="font-semibold text-[#0033CC] hover:text-blue-800 transition-colors" onClick={() => setMode('login')}>
                  Sign in
                </button>
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
