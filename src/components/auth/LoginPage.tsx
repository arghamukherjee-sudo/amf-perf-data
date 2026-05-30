import { useState } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { Navigate, Link } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, BarChart3 } from 'lucide-react';
import toast from 'react-hot-toast';
import ThemeToggle from '../ui/ThemeToggle';

export default function LoginPage() {
  const { signIn, loading, initialized, profile } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  if (initialized && profile) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await signIn(email, password);
      toast.success('Welcome back!');
    } catch (err: any) {
      toast.error(err.message || 'Invalid credentials');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative bg-primary transition-colors duration-300">
      {/* Theme Toggle */}
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8 animate-fade-up">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 transition-colors duration-300"
            style={{ background: 'rgb(var(--text-primary))' }}
          >
            <BarChart3
              className="w-8 h-8"
              style={{ color: 'rgb(var(--bg-primary))' }}
            />
          </div>
          <h1 className="text-3xl font-bold text-primary">AMF Performance</h1>
          <p className="text-secondary mt-2">Sign in to your account</p>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl p-8 border animate-fade-up shadow-elevated"
          style={{
            background: 'rgb(var(--bg-card))',
            borderColor: 'rgb(var(--border-default))',
            animationDelay: '0.1s',
          }}
        >
          <div className="space-y-5">
            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-primary mb-2">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input pl-12"
                  placeholder="you@company.com"
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-primary mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input pl-12 pr-12"
                  placeholder="Enter your password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted hover:text-primary transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  Signing in...
                </span>
              ) : (
                'Sign In'
              )}
            </button>
          </div>
        </form>

        {/* Register Link */}
        <p className="text-center text-secondary mt-6 animate-fade-up" style={{ animationDelay: '0.2s' }}>
          Don't have an account?{' '}
          <Link
            to="/register"
            className="text-primary hover:underline font-medium"
          >
            Register
          </Link>
        </p>
      </div>
    </div>
  );
}
