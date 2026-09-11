import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Sun, Zap, Lock, Mail, User as UserIcon, ArrowRight } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import Button from '../components/common/Button';

export const Register = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('prosumer');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await register({
      email,
      password,
      full_name: fullName,
      role,
    });
    setLoading(false);

    if (res.success) {
      navigate('/');
    } else {
      setError(res.error);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="mx-auto w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-amber-500 flex items-center justify-center text-white shadow-md shadow-emerald-600/20 mb-3">
          <Sun className="w-7 h-7" />
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
          Join Solar<span className="text-emerald-600">Mesh</span>
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Select your role to participate in decentralized peer-to-peer energy exchange
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <div className="bg-white py-8 px-6 sm:px-10 shadow-sm border border-slate-200/80 rounded-2xl">
          {error && (
            <div className="mb-5 p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs font-semibold text-rose-800">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Role Selector */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Select Your Participant Role
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setRole('prosumer')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    role === 'prosumer'
                      ? 'bg-amber-50/70 border-amber-400 text-amber-900 shadow-xs'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Sun className={`w-5 h-5 mb-1 ${role === 'prosumer' ? 'text-amber-600' : 'text-slate-400'}`} />
                  <div className="text-xs font-bold">Solar Prosumer</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">I generate & sell solar surplus</div>
                </button>

                <button
                  type="button"
                  onClick={() => setRole('consumer')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    role === 'consumer'
                      ? 'bg-blue-50/70 border-blue-400 text-blue-900 shadow-xs'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Zap className={`w-5 h-5 mb-1 ${role === 'consumer' ? 'text-blue-600' : 'text-slate-400'}`} />
                  <div className="text-xs font-bold">Clean Consumer</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">I buy local green electricity</div>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Full Name
              </label>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  placeholder="Jane Doe"
                  required
                />
              </div>
            </div>

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
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  placeholder="name@domain.com"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Password (min. 8 chars)
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  placeholder="••••••••"
                  minLength={8}
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
              Create Account & Wallet
            </Button>
          </form>

          <div className="mt-6 text-center text-xs text-slate-500">
            Already have an account?{' '}
            <Link to="/login" className="font-semibold text-emerald-600 hover:text-emerald-700">
              Sign In
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Register;
