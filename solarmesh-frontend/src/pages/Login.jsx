import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Sun, Lock, Mail, ArrowRight, ShieldCheck, Zap } from 'lucide-react';
import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '../hooks/useAuth';
import Button from '../components/common/Button';

export const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const { login, loginGoogle } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await login(email, password);
    setLoading(false);

    if (res.success) {
      navigate('/');
    } else {
      setError(res.error);
    }
  };

  const handleGoogleSuccess = async (credentialResponse) => {
    setLoading(true);
    setError(null);
    try {
      const res = await loginGoogle(credentialResponse.credential);
      if (res.success) {
        navigate('/');
      } else {
        setError(res.error || 'Google login failed');
      }
    } catch (err) {
      setError(err.message || 'Google login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleError = () => {
    setError('Google login failed or was cancelled');
  };

  // Quick fill helper for hackathon judges & testers
  const handleQuickFill = (role) => {
    if (role === 'prosumer') {
      setEmail('alice@demo.io');
      setPassword('password123');
    } else {
      setEmail('carol@demo.io');
      setPassword('password123');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-8 px-4 sm:py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        {/* Logo */}
        <div className="mx-auto w-12 h-12 rounded-2xl bg-slate-900 flex items-center justify-center text-white shadow-2xs mb-3">
          <Sun className="w-6 h-6" />
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
          Sign in to Solar<span className="text-emerald-700">Mesh</span>
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Network-aware peer-to-peer solar energy trading marketplace
        </p>
      </div>

      <div className="mt-6 sm:mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-6 px-4 sm:py-8 sm:px-10 shadow-2xs border border-slate-200/80 rounded-2xl">
          {error && (
            <div className="mb-5 p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs font-semibold text-rose-800 break-words">
              {error}
            </div>
          )}

          {/* Google OAuth Login */}
          <div className="mb-5 flex flex-col items-center justify-center">
            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={handleGoogleError}
              text="continue_with"
              theme="outline"
              size="large"
              shape="rectangular"
              width="320"
            />
          </div>

          <div className="relative mb-5 flex items-center justify-center">
            <div className="w-full border-t border-slate-200"></div>
            <span className="bg-white px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider absolute">
              or sign in with email
            </span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  placeholder="name@domain.com"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              isLoading={loading}
              className="w-full py-2.5 mt-2"
              icon={ArrowRight}
              iconPosition="right"
            >
              Sign In to Marketplace
            </Button>
          </form>

          {/* Quick Demo Pre-fill Buttons */}
          <div className="mt-6 pt-5 border-t border-slate-100">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block text-center mb-2.5">
              Instant Demo Credentials
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleQuickFill('prosumer')}
                className="py-2 px-2.5 rounded-lg text-xs font-semibold bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 transition-colors flex items-center justify-center space-x-1.5 shadow-2xs cursor-pointer"
              >
                <Sun className="w-3.5 h-3.5 text-slate-600" />
                <span>Prosumer Demo</span>
              </button>
              <button
                type="button"
                onClick={() => handleQuickFill('consumer')}
                className="py-2 px-2.5 rounded-lg text-xs font-semibold bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 transition-colors flex items-center justify-center space-x-1.5 shadow-2xs cursor-pointer"
              >
                <Zap className="w-3.5 h-3.5 text-slate-600" />
                <span>Consumer Demo</span>
              </button>
            </div>
          </div>

          <div className="mt-6 text-center text-xs text-slate-500">
            Don't have an account?{' '}
            <Link to="/register" className="font-semibold text-emerald-700 hover:text-emerald-800">
              Register as Prosumer / Consumer
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
