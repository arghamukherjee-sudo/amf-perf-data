import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { useThemeStore } from '../stores/themeStore';
import { DollarSign, Bell, LayoutDashboard, BarChart3, Save, Check, ChevronDown } from 'lucide-react';
import toast from 'react-hot-toast';
import Spinner from '../components/ui/Spinner';

interface Settings {
  currencySymbol: string;
  currencyFormat: string;
  emailNotifications: boolean;
  pushNotifications: boolean;
  defaultView: string;
  chartPreference: string;
}

const defaultSettings: Settings = {
  currencySymbol: '$',
  currencyFormat: 'symbol-first',
  emailNotifications: true,
  pushNotifications: true,
  defaultView: 'dashboard',
  chartPreference: 'bar',
};

const currencySymbols = [
  { value: '$', label: 'USD ($)' },
  { value: 'EUR', label: 'EUR (Euro)' },
  { value: 'GBP', label: 'GBP (Pound)' },
  { value: 'INR', label: 'INR (Rupee)' },
  { value: 'JPY', label: 'JPY (Yen)' },
  { value: 'CNY', label: 'CNY (Yuan)' },
];

const currencyFormats = [
  { value: 'symbol-first', label: '$1,234.56' },
  { value: 'symbol-last', label: '1,234.56$' },
  { value: 'code-first', label: 'USD 1,234.56' },
  { value: 'code-last', label: '1,234.56 USD' },
];

const defaultViews = [
  { value: 'dashboard', label: 'Dashboard' },
  { value: 'revenue', label: 'Revenue' },
  { value: 'leads', label: 'Leads' },
  { value: 'performance', label: 'Performance' },
  { value: 'attendance', label: 'Attendance' },
];

const chartPreferences = [
  { value: 'bar', label: 'Bar Charts' },
  { value: 'line', label: 'Line Charts' },
  { value: 'area', label: 'Area Charts' },
  { value: 'pie', label: 'Pie Charts' },
];

export default function SettingsPage() {
  const { profile } = useAuthStore();
  const { theme, toggleTheme, setTheme } = useThemeStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<Settings>(defaultSettings);

  const loadSettings = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    try {
      const { data: dbSettings } = await supabase.from('settings').select('*').eq('user_id', profile.id);
      if (dbSettings && dbSettings.length > 0) {
        const merged: any = { ...defaultSettings };
        dbSettings.forEach((s: any) => { if (s.key in merged) merged[s.key] = s.value; });
        setSettings(merged);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  const saveSetting = async (key: string, value: any) => {
    if (!profile?.id) return;
    setSaving(true);
    try {
      await supabase.from('settings').upsert({ user_id: profile.id, key, value: String(value) }, { onConflict: 'user_id,key' });
      setSettings((s) => ({ ...s, [key]: value }));
      toast.success('Saved');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const saveAllSettings = async () => {
    if (!profile?.id) return;
    setSaving(true);
    try {
      const entries = Object.entries(settings).map(([key, value]) => ({ user_id: profile.id, key, value: String(value) }));
      await supabase.from('settings').upsert(entries, { onConflict: 'user_id,key' });
      toast.success('All settings saved');
    } catch (err: any) {
      toast.error(err.message || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><Spinner size="lg" /></div>;

  const Section = ({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) => (
    <div className="card p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgb(var(--bg-elevated))' }}>
          <Icon className="w-5 h-5 text-primary" />
        </div>
        <h2 className="text-lg font-semibold text-primary">{title}</h2>
      </div>
      {children}
    </div>
  );

  const Toggle = ({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => (
    <button onClick={() => onChange(!checked)} className={checked ? 'bg-primary' : 'bg-[rgb(var(--bg-elevated))]'} style={{ width: '44px', height: '24px', borderRadius: '12px', position: 'relative', transition: 'all 0.2s' }}>
      <span className="absolute top-0.5 rounded-full w-5 h-5 transition-all duration-200" style={{ left: checked ? '18px' : '2px', background: checked ? 'rgb(var(--bg-primary))' : 'rgb(var(--text-muted))' }} />
    </button>
  );

  const Select = ({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) => (
    <div className="relative">
      <select value={value} onChange={(e) => onChange(e.target.value)} className="input pr-10 appearance-none">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
    </div>
  );

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary">Settings</h1>
          <p className="text-secondary text-sm mt-1">Customize your dashboard experience</p>
        </div>
        <button onClick={saveAllSettings} disabled={saving} className="btn-primary px-4 py-2 text-sm flex items-center gap-2">
          {saving ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Save className="w-4 h-4" />}Save All
        </button>
      </div>

      {/* Theme Section */}
      <Section title="Theme" icon={LayoutDashboard}>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-primary">Appearance</p>
              <p className="text-xs text-muted">Choose between light and dark mode</p>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => setTheme('light')} className={theme === 'light' ? 'btn-primary px-4 py-2 text-sm' : 'btn-secondary px-4 py-2 text-sm'}>Light</button>
              <button onClick={() => setTheme('dark')} className={theme === 'dark' ? 'btn-primary px-4 py-2 text-sm' : 'btn-secondary px-4 py-2 text-sm'}>Dark</button>
            </div>
          </div>
        </div>
      </Section>

      {/* Currency Section */}
      <Section title="Currency" icon={DollarSign}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-secondary mb-2">Currency Symbol</label>
            <Select value={settings.currencySymbol} onChange={(v) => saveSetting('currencySymbol', v)} options={currencySymbols} />
          </div>
          <div>
            <label className="block text-sm font-medium text-secondary mb-2">Display Format</label>
            <Select value={settings.currencyFormat} onChange={(v) => saveSetting('currencyFormat', v)} options={currencyFormats} />
          </div>
        </div>
      </Section>

      {/* Notifications Section */}
      <Section title="Notifications" icon={Bell}>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-primary">Email Notifications</p>
              <p className="text-xs text-muted">Receive email alerts for important updates</p>
            </div>
            <Toggle checked={settings.emailNotifications} onChange={(v) => saveSetting('emailNotifications', v)} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-primary">Push Notifications</p>
              <p className="text-xs text-muted">Receive in-app push notifications</p>
            </div>
            <Toggle checked={settings.pushNotifications} onChange={(v) => saveSetting('pushNotifications', v)} />
          </div>
        </div>
      </Section>

      {/* Dashboard Section */}
      <Section title="Dashboard" icon={BarChart3}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-secondary mb-2">Default View</label>
            <Select value={settings.defaultView} onChange={(v) => saveSetting('defaultView', v)} options={defaultViews} />
          </div>
          <div>
            <label className="block text-sm font-medium text-secondary mb-2">Preferred Chart Type</label>
            <Select value={settings.chartPreference} onChange={(v) => saveSetting('chartPreference', v)} options={chartPreferences} />
          </div>
        </div>
      </Section>

      <div className="card p-4 text-center">
        <p className="text-sm text-muted">Settings are automatically saved. Click "Save All" to ensure all changes are persisted.</p>
      </div>
    </div>
  );
}
