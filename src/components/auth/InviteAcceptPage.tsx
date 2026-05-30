import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { Lock, Eye, EyeOff, UserPlus, BarChart3 } from 'lucide-react';
import toast from 'react-hot-toast';
import ThemeToggle from '../ui/ThemeToggle';

interface InvitationData {
  email: string;
  role: string;
  is_accepted: boolean;
  expires_at: string;
}

export default function InviteAcceptPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { signUp } = useAuthStore();
  const token = searchParams.get('token');

  const [loading, setLoading] = useState(true);
  const [valid, setValid] = useState(false);
  const [inviteData, setInviteData] = useState<InvitationData | null>(null);
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const { data, error } = await supabase
          .from('invitations')
          .select('email, role, is_accepted, expires_at')
          .eq('token', token)
          .maybeSingle();

        if (error || !data) {
          setValid(false);
          setLoading(false);
          return;
        }

        if (data.is_accepted) {
          toast.error('This invitation has already been used');
          setValid(false);
          setLoading(false);
          return;
        }

        if (new Date(data.expires_at) < new Date()) {
          toast.error('This invitation has expired');
          setValid(false);
          setLoading(false);
          return;
        }

        setInviteData(data);
        setValid(true);
      } catch (err) {
        console.error('Error loading invitation:', err);
        setValid(false);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!inviteData) return;

    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    if (!fullName.trim()) {
      toast.error('Full name is required');
      return;
    }

    setSubmitting(true);
    try {
      // Sign up the user - this creates auth.users and triggers profile creation
      await signUp(inviteData.email, password, fullName.trim());

      // Update the invitation as accepted
      if (token) {
        await supabase
          .from('invitations')
          .update({ is_accepted: true })
          .eq('token', token);

        // Update the profile role (since it defaults to team_member)
        const { data: { user } } = await supabase.auth.getUser();
        if (user && inviteData.role !== 'team_member') {
          await supabase
            .from('profiles')
            .update({ role: inviteData.role })
            .eq('id', user.id);
        }
      }

      toast.success('Account created successfully!');
      navigate('/', { replace: true });
    } catch (err: any) {
      console.error('Error creating account:', err);
      toast.error(err.message || 'Failed to create account');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center relative bg-primary">
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!valid || !inviteData) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 relative bg-primary">
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>
        <div className="text-center">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
            style={{ background: 'rgb(var(--text-primary))' }}
          >
            <BarChart3 className="w-8 h-8" style={{ color: 'rgb(var(--bg-primary))' }} />
          </div>
          <h2 className="text-2xl font-bold text-primary mb-2">Invalid or Expired Invitation</h2>
          <p className="text-secondary">This invitation link is no longer valid or has expired.</p>
          <button
            onClick={() => navigate('/login')}
            className="btn-primary mt-6 px-6 py-2"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative bg-primary transition-colors duration-300">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md">
        <div className="text-center mb-8 animate-fade-up">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
            style={{ background: 'rgb(var(--text-primary))' }}
          >
            <BarChart3 className="w-8 h-8" style={{ color: 'rgb(var(--bg-primary))' }} />
          </div>
          <h1 className="text-3xl font-bold text-primary">AMF Performance</h1>
          <p className="text-secondary mt-2">
            You've been invited as{' '}
            <span className="font-medium text-primary capitalize">
              {inviteData.role.replace('_', ' ')}
            </span>
          </p>
        </div>

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
            <div>
              <label className="block text-sm font-medium text-primary mb-2">
                Email
              </label>
              <input
                type="email"
                value={inviteData.email}
                disabled
                className="input cursor-not-allowed opacity-60"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-primary mb-2">
                Full Name
              </label>
              <div className="relative">
                <UserPlus className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="input pl-12"
                  placeholder="Your full name"
                  required
                />
              </div>
            </div>

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
                  placeholder="Create a password (min 6 characters)"
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted hover:text-primary transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-primary mb-2">
                Confirm Password
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="input pl-12"
                  placeholder="Confirm your password"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="btn-primary w-full py-3"
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  Creating Account...
                </span>
              ) : (
                'Create Account'
              )}
            </button>
          </div>
        </form>

        <p className="text-center text-secondary mt-6 animate-fade-up" style={{ animationDelay: '0.2s' }}>
          Already have an account?{' '}
          <button
            onClick={() => navigate('/login')}
            className="text-primary hover:underline font-medium"
          >
            Sign In
          </button>
        </p>
      </div>
    </div>
  );
}
