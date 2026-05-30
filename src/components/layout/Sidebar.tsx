import { NavLink } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import {
  LayoutDashboard,
  Users,
  IndianRupee,
  CalendarCheck,
  Target,
  BarChart3,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  X,
  UserPlus,
  Crosshair,
  TrendingUp,
  Activity,
  Repeat,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import type { Role } from '../../types';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

interface NavItem {
  to: string;
  icon: React.ElementType;
  label: string;
  minRole: Role;
}

const navItems: NavItem[] = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', minRole: 'team_member' },
  { to: '/team', icon: Users, label: 'Team', minRole: 'team_member' },
  { to: '/leads', icon: UserPlus, label: 'Leads', minRole: 'team_member' },
  { to: '/revenue', icon: IndianRupee, label: 'Revenue', minRole: 'team_member' },
  { to: '/attendance', icon: CalendarCheck, label: 'Attendance', minRole: 'team_member' },
  { to: '/weekly-targets', icon: Crosshair, label: 'Weekly', minRole: 'team_member' },
  { to: '/monthly-targets', icon: Target, label: 'Monthly', minRole: 'team_member' },
  { to: '/kpi', icon: Activity, label: 'KPI', minRole: 'team_member' },
  { to: '/performance', icon: TrendingUp, label: 'Performance', minRole: 'team_member' },
  { to: '/billing-cycles', icon: Repeat, label: 'Cycles', minRole: 'team_member' },
  { to: '/reports', icon: BarChart3, label: 'Reports', minRole: 'team_member' },
  { to: '/settings', icon: Settings, label: 'Settings', minRole: 'team_member' },
];

export default function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose }: SidebarProps) {
  const { profile, signOut } = useAuthStore();

  const roleHierarchy: Record<Role, number> = { team_member: 0, admin: 1, super_admin: 2 };
  const userLevel = roleHierarchy[profile?.role || 'team_member'];

  const visibleItems = navItems.filter(
    (item) => userLevel >= roleHierarchy[item.minRole]
  );

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div
        className={cn(
          'flex items-center gap-3 h-16 px-4 border-b transition-colors',
          collapsed && 'justify-center px-2'
        )}
        style={{ borderColor: 'rgb(var(--border-default))' }}
      >
        <div
          className={cn(
            'w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-200',
            'bg-[rgb(var(--text-primary))]'
          )}
        >
          <BarChart3
            className="w-5 h-5"
            style={{ color: 'rgb(var(--bg-primary))' }}
          />
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <h1 className="text-sm font-bold whitespace-nowrap" style={{ color: 'rgb(var(--text-primary))' }}>
              AMF
            </h1>
            <p className="text-[10px] whitespace-nowrap" style={{ color: 'rgb(var(--text-muted))' }}>
              Performance
            </p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {visibleItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            onClick={onMobileClose}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 relative group',
                collapsed && 'justify-center px-2',
                isActive
                  ? 'active-item text-primary'
                  : 'text-secondary hover:text-primary hover:bg-hover'
              )
            }
          >
            <item.icon
              className={cn('w-[18px] h-[18px] flex-shrink-0 transition-transform duration-200',
                'group-hover:scale-110'
              )}
            />
            {!collapsed && (
              <span className="whitespace-nowrap text-[13px]">{item.label}</span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User Section */}
      <div className="border-t p-2" style={{ borderColor: 'rgb(var(--border-default))' }}>
        {!collapsed && profile && (
          <div className="px-3 py-2 mb-1">
            <p
              className="text-sm font-medium truncate"
              style={{ color: 'rgb(var(--text-primary))' }}
            >
              {profile.full_name || profile.email}
            </p>
            <p
              className="text-[11px] capitalize"
              style={{ color: 'rgb(var(--text-muted))' }}
            >
              {profile.role.replace('_', ' ')}
            </p>
          </div>
        )}
        <button
          onClick={signOut}
          className={cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 w-full text-secondary hover:text-primary hover:bg-hover',
            collapsed && 'justify-center px-2'
          )}
        >
          <LogOut className="w-[18px] h-[18px] flex-shrink-0" />
          {!collapsed && <span className="text-[13px]">Sign Out</span>}
        </button>
      </div>

      {/* Collapse Toggle */}
      <button
        onClick={onToggle}
        className="hidden lg:flex items-center justify-center w-8 h-8 absolute -right-4 top-20 rounded-full transition-all duration-200 hover:scale-110"
        style={{
          background: 'rgb(var(--bg-elevated))',
          border: '1px solid rgb(var(--border-default))',
          color: 'rgb(var(--text-secondary))',
        }}
      >
        {collapsed ? (
          <ChevronRight className="w-4 h-4" />
        ) : (
          <ChevronLeft className="w-4 h-4" />
        )}
      </button>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          'hidden lg:flex flex-col fixed top-0 left-0 h-full border-r z-30 transition-all duration-300',
          collapsed ? 'w-16' : 'w-56'
        )}
        style={{
          background: 'rgb(var(--bg-secondary))',
          borderColor: 'rgb(var(--border-default))',
        }}
      >
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div
            className="fixed inset-0 transition-opacity duration-300"
            style={{ background: 'rgb(0 0 0 / 0.8)', backdropFilter: 'blur(4px)' }}
            onClick={onMobileClose}
          />
          <aside
            className="relative w-64 h-full flex flex-col animate-slide-in-right"
            style={{
              background: 'rgb(var(--bg-secondary))',
              borderRight: '1px solid rgb(var(--border-default))',
            }}
          >
            <button
              onClick={onMobileClose}
              className="absolute top-4 right-4 p-2 rounded-lg transition-colors"
              style={{ color: 'rgb(var(--text-secondary))' }}
            >
              <X className="w-5 h-5" />
            </button>
            <SidebarContent />
          </aside>
        </div>
      )}
    </>
  );
}
