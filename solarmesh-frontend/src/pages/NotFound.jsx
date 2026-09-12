import React from 'react';
import { Link } from 'react-router-dom';
import { Sun, ArrowLeft } from 'lucide-react';
import Button from '../components/common/Button';

export const NotFound = () => {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-amber-100 text-amber-600 border border-transparent flex items-center justify-center mb-4">
        <Sun className="w-8 h-8 animate-spin-slow" />
      </div>
      <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">404</h1>
      <h2 className="text-lg font-bold text-slate-700 mt-1">Page Not Found</h2>
      <p className="text-xs text-slate-500 max-w-sm mt-2 mb-6">
        The microgrid node or page you are looking for does not exist in the routing table.
      </p>
      <Link to="/">
        <Button variant="primary" icon={ArrowLeft}>
          Return to Dashboard
        </Button>
      </Link>
    </div>
  );
};

export default NotFound;
