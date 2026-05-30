import { useAuthStore } from '../../stores/authStore';
import { getBillingCycleLabel } from '../../lib/utils';
import { Menu, Bell } from 'lucide-react';
import ThemeToggle from '../ui/ThemeToggle';

interface HeaderProps {
  onMobileMenuToggle: () => void;
}

export default function Header({ onMobileMenuToggle }: HeaderProps) {
  const { profile } = useAuthStore();
  const cycleLabel = getBillingCycleLabel();

  return (
    <header className="sticky top-0 z-20 h-16 border-b transition-colors duration-300 bg-primary glass-strong">
      <div className="flex items-center justify-between h-full px-4 lg:px-6">
        <div className="flex items-center gap-3">
          <button
            onClick={onMobileMenuToggle}
            className="lg:hidden p-2 text-secondary hover:text-primary transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="hidden sm:block">
            <p className="text-xs text-muted">Current Billing Cycle</p>
            <p className="text-sm font-semibold text-primary">{cycleLabel}</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Theme Toggle */}
          <ThemeToggle />

          {/* Notifications */}
          <button className="relative p-2 text-secondary hover:text-primary transition-colors">
            <Bell className="w-5 h-5" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary" />
          </button>

          {/* Profile */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold bg-primary text-[rgb(var(--bg-primary))]">
              {(profile?.full_name || profile?.email || '?')[0].toUpperCase()}
            </div>
            <div className="hidden sm:block">
              <p className="text-sm font-medium text-primary truncate max-w-[140px]">
                {profile?.full_name || profile?.email}
              </p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
