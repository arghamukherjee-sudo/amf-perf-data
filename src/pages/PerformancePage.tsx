import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore, hasRole } from '../stores/authStore';
import { formatINR, percentage, getBillingCycle, getBillingCycleLabel, cn } from '../lib/utils';
import { ChevronLeft, ChevronRight, Download, Award, TrendingUp, TrendingDown, Minus, BarChart3 } from 'lucide-react';
import toast from 'react-hot-toast';
import Spinner from '../components/ui/Spinner';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from 'recharts';
import * as XLSX from 'xlsx';

interface MemberPerformance {
  id: string;
  name: string;
  email: string;
  revenue: number;
  leads: number;
  attendance: number;
  calls: number;
  talkTime: number;
  arpu: number;
  achievement: number;
  overall: number;
  rank: number;
}

type SortField = 'revenue' | 'leads' | 'attendance' | 'calls' | 'talkTime' | 'arpu' | 'achievement' | 'overall';
type SortDir = 'asc' | 'desc';

export default function PerformancePage() {
  const { profile } = useAuthStore();
  const [performers, setPerformers] = useState<MemberPerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [cycleOffset, setCycleOffset] = useState(0);
  const [sortField, setSortField] = useState<SortField>('overall');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [viewMode, setViewMode] = useState<'table' | 'chart'>('chart');

  const cycleDate = new Date();
  cycleDate.setMonth(cycleDate.getMonth() + cycleOffset);
  const cycle = getBillingCycle(cycleDate);
  const cycleLabel = getBillingCycleLabel(cycleDate);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const cs = cycle.start.toISOString().split('T')[0];
      const ce = cycle.end.toISOString().split('T')[0];

      const [profilesRes, leadsRes, attRes, kpiRes, targetsRes] = await Promise.all([
        supabase.from('profiles').select('id, full_name, email').eq('is_active', true),
        supabase.from('lead_assignments').select('user_id, revenue, leads_assigned').gte('billing_cycle_start', cs).lte('billing_cycle_end', ce),
        supabase.from('attendance_entries').select('user_id, status').gte('date', cs).lte('date', ce),
        supabase.from('daily_kpi').select('user_id, call_attempts, talk_time').gte('date', cs).lte('date', ce),
        supabase.from('monthly_targets').select('user_id, target_value, category').gte('billing_cycle_start', cs).lte('billing_cycle_end', ce),
      ]);

      const profiles = profilesRes.data || [];
      const leads = leadsRes.data || [];
      const attendances = attRes.data || [];
      const kpis = kpiRes.data || [];
      const targets = targetsRes.data || [];

      // Aggregate by user
      const revenueAgg = new Map<string, { revenue: number; leads: number }>();
      leads.forEach((l: any) => {
        if (!revenueAgg.has(l.user_id)) revenueAgg.set(l.user_id, { revenue: 0, leads: 0 });
        const a = revenueAgg.get(l.user_id)!;
        a.revenue += Number(l.revenue) || 0;
        a.leads += Number(l.leads_assigned) || 0;
      });

      const attAgg = new Map<string, { present: number; total: number }>();
      attendances.forEach((a: any) => {
        if (a.status === 'week_off') return;
        if (!attAgg.has(a.user_id)) attAgg.set(a.user_id, { present: 0, total: 0 });
        const entry = attAgg.get(a.user_id)!;
        entry.total += 1;
        if (a.status === 'present' || a.status === 'half_day') entry.present += 1;
      });

      const kpiAgg = new Map<string, { calls: number; time: number }>();
      kpis.forEach((k: any) => {
        if (!kpiAgg.has(k.user_id)) kpiAgg.set(k.user_id, { calls: 0, time: 0 });
        const entry = kpiAgg.get(k.user_id)!;
        entry.calls += Number(k.call_attempts) || 0;
        entry.time += Number(k.talk_time) || 0;
      });

      const targetMap = new Map<string, number>();
      targets.filter((t: any) => t.category === 'revenue').forEach((t: any) => {
        targetMap.set(t.user_id, Number(t.target_value) || 100000);
      });

      const result: MemberPerformance[] = profiles.map((p: any, idx) => {
        const rev = revenueAgg.get(p.id) || { revenue: 0, leads: 0 };
        const att = attAgg.get(p.id) || { present: 0, total: 0 };
        const kpi = kpiAgg.get(p.id) || { calls: 0, time: 0 };
        const target = targetMap.get(p.id) || 100000;
        const attendancePct = att.total > 0 ? percentage(att.present, att.total) : 0;
        const achievementPct = percentage(rev.revenue, target);
        const arpu = rev.leads > 0 ? rev.revenue / rev.leads : 0;
        const overall = Math.round((achievementPct * 0.4 + attendancePct * 0.2 + Math.min(kpi.calls / 20, 100) * 0.2 + Math.min(rev.leads * 2, 100) * 0.2) * 10) / 10;

        return {
          id: p.id,
          name: p.full_name || p.email,
          email: p.email,
          revenue: rev.revenue,
          leads: rev.leads,
          attendance: attendancePct,
          calls: kpi.calls,
          talkTime: Math.round(kpi.time / 60),
          arpu,
          achievement: achievementPct,
          overall,
          rank: idx + 1,
        };
      });

      // Sort and assign ranks
      result.sort((a, b) => b.overall - a.overall);
      result.forEach((p, i) => { p.rank = i + 1; });

      setPerformers(result);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load performance data');
    } finally {
      setLoading(false);
    }
  }, [cycleOffset]);

  useEffect(() => { loadData(); }, [loadData]);

  const sortedPerformers = [...performers].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return dir * (a[sortField] - b[sortField]);
  });

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  };

  const exportToXLSX = () => {
    const rows = sortedPerformers.map((p) => ({
      Rank: p.rank,
      Name: p.name,
      Revenue: p.revenue,
      Leads: p.leads,
      'Attendance %': p.attendance,
      Calls: p.calls,
      'Talk Time (min)': p.talkTime,
      ARPU: Math.round(p.arpu),
      'Achievement %': p.achievement,
      'Overall Score': p.overall,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Performance');
    XLSX.writeFile(wb, `team_performance_${cycle.start.toISOString().split('T')[0]}.xlsx`);
    toast.success('Exported');
  };

  const topPerformer = sortedPerformers[0];
  const bottomPerformer = sortedPerformers[sortedPerformers.length - 1];

  // Chart data
  const chartData = sortedPerformers.slice(0, 8).map((p) => ({
    name: p.name.length > 8 ? p.name.substring(0, 8) + '..' : p.name,
    Revenue: p.revenue / 1000,
    Leads: p.leads,
    Attendance: p.attendance,
    Calls: p.calls,
  }));

  // Radar data for top 5 comparison
  const radarData = ['Revenue', 'Leads', 'Attendance', 'Calls', 'Achievement'].map((metric) => ({
    metric,
    ...Object.fromEntries(sortedPerformers.slice(0, 5).map((p) => {
      const val = metric === 'Revenue' ? p.revenue / 100000 :
                  metric === 'Leads' ? p.leads :
                  metric === 'Attendance' ? p.attendance :
                  metric === 'Calls' ? p.calls :
                  p.achievement;
      return [p.name.substring(0, 8), Math.min(val, 100)];
    })),
  }));

  const tooltipStyle = { background: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '12px' };

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><Spinner size="lg" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary">Team Performance</h1>
          <p className="text-secondary text-sm mt-1">{cycleLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setCycleOffset((p) => p - 1)} className="btn-secondary p-2"><ChevronLeft className="w-4 h-4" /></button>
          <button onClick={() => setCycleOffset(0)} className="btn-primary">Current</button>
          <button onClick={() => setCycleOffset((p) => p + 1)} className="btn-secondary p-2"><ChevronRight className="w-4 h-4" /></button>
          <div className="w-px h-6 bg-[rgb(var(--border-default))]" />
          <button onClick={() => setViewMode(viewMode === 'chart' ? 'table' : 'chart')} className="btn-secondary flex items-center gap-1"><BarChart3 className="w-4 h-4" />{viewMode === 'chart' ? 'Table' : 'Chart'}</button>
          <button onClick={exportToXLSX} className="btn-secondary flex items-center gap-1"><Download className="w-4 h-4" />Export</button>
        </div>
      </div>

      {/* Top/Bottom Performers */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 rounded-2xl border border-amber-500/20 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Award className="w-5 h-5 text-amber-400" />
            <span className="text-xs font-semibold text-amber-400 uppercase">Top Performer</span>
          </div>
          <p className="text-lg font-bold text-primary">{topPerformer?.name || '-'}</p>
          <p className="text-sm text-secondary">Score: {topPerformer?.overall || 0}</p>
        </div>
        <div className="bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 rounded-2xl border border-emerald-500/20 p-5">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-5 h-5 text-emerald-400" />
            <span className="text-xs font-semibold text-emerald-400 uppercase">Best Revenue</span>
          </div>
          <p className="text-lg font-bold text-primary">{sortedPerformers.sort((a, b) => b.revenue - a.revenue)[0]?.name || '-'}</p>
          <p className="text-sm text-secondary">{formatINR(sortedPerformers[0]?.revenue || 0)}</p>
        </div>
        <div className="bg-gradient-to-br from-rose-500/10 to-rose-600/5 rounded-2xl border border-rose-500/20 p-5">
          <div className="flex items-center gap-2 mb-3">
            <TrendingDown className="w-5 h-5 text-rose-400" />
            <span className="text-xs font-semibold text-rose-400 uppercase">Needs Improvement</span>
          </div>
          <p className="text-lg font-bold text-primary">{bottomPerformer?.name || '-'}</p>
          <p className="text-sm text-secondary">Score: {bottomPerformer?.overall || 0}</p>
        </div>
      </div>

      {viewMode === 'chart' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card rounded-2xl p-6">
            <h3 className="text-sm font-semibold text-primary mb-4">Performance Comparison</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border-default))" />
                <XAxis dataKey="name" stroke="rgb(var(--text-secondary))" tick={{ fontSize: 10 }} />
                <YAxis stroke="rgb(var(--text-secondary))" tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend />
                <Bar dataKey="Revenue" fill="#3b82f6" name="Revenue (k)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Leads" fill="#10b981" name="Leads" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Attendance" fill="#f59e0b" name="Att %" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="card rounded-2xl p-6">
            <h3 className="text-sm font-semibold text-primary mb-4">Top 5 Radar Comparison</h3>
            <ResponsiveContainer width="100%" height={280}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="rgb(var(--border-default))" />
                <PolarAngleAxis dataKey="metric" stroke="rgb(var(--text-secondary))" tick={{ fontSize: 10 }} />
                <PolarRadiusAxis stroke="rgb(var(--text-secondary))" />
                {sortedPerformers.slice(0, 5).map((p, i) => (
                  <Radar key={p.id} name={p.name.substring(0, 8)} dataKey={p.name.substring(0, 8)} stroke={['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'][i]} fill={['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'][i]} fillOpacity={0.1} />
                ))}
                <Legend />
                <Tooltip contentStyle={tooltipStyle} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : null}

      {/* Rankings Table */}
      <div className="table-container rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-[rgb(var(--border-default))]">
          <h3 className="text-lg font-semibold text-primary">Team Rankings</h3>
          <p className="text-xs text-secondary">Click column headers to sort</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="table-header sticky top-0">
              <tr>
                <th className="text-center px-4 py-3 text-xs font-semibold text-amber-400 uppercase w-16">Rank</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-secondary uppercase cursor-pointer hover:text-primary" onClick={() => handleSort('revenue')}>Revenue {sortField === 'revenue' && (sortDir === 'asc' ? '^' : 'v')}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-secondary uppercase cursor-pointer hover:text-primary" onClick={() => handleSort('leads')}>Leads {sortField === 'leads' && (sortDir === 'asc' ? '^' : 'v')}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-secondary uppercase cursor-pointer hover:text-primary" onClick={() => handleSort('attendance')}>Attendance % {sortField === 'attendance' && (sortDir === 'asc' ? '^' : 'v')}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-secondary uppercase cursor-pointer hover:text-primary" onClick={() => handleSort('calls')}>Calls {sortField === 'calls' && (sortDir === 'asc' ? '^' : 'v')}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-secondary uppercase cursor-pointer hover:text-primary" onClick={() => handleSort('talkTime')}>Talk Time {sortField === 'talkTime' && (sortDir === 'asc' ? '^' : 'v')}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-secondary uppercase cursor-pointer hover:text-primary" onClick={() => handleSort('arpu')}>ARPU {sortField === 'arpu' && (sortDir === 'asc' ? '^' : 'v')}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-secondary uppercase cursor-pointer hover:text-primary" onClick={() => handleSort('achievement')}>Achievement % {sortField === 'achievement' && (sortDir === 'asc' ? '^' : 'v')}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-secondary uppercase cursor-pointer hover:text-primary" onClick={() => handleSort('overall')}>Overall {sortField === 'overall' && (sortDir === 'asc' ? '^' : 'v')}</th>
              </tr>
            </thead>
            <tbody>
              {sortedPerformers.map((p, i) => (
                <tr key={p.id} className={cn('table-row transition-colors', i < 3 && 'bg-amber-500/5')}>
                  <td className="px-4 py-3 text-center">
                    <span className={cn('inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-bold', i === 0 ? 'bg-amber-500 text-white' : i === 1 ? 'bg-slate-400 text-slate-900' : i === 2 ? 'bg-orange-600 text-white' : 'bg-[rgb(var(--bg-elevated))] text-secondary')}>
                      {p.rank}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-primary">{p.name}</span>
                      <span className="text-xs text-secondary">{p.email}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-emerald-400 font-semibold">{formatINR(p.revenue)}</td>
                  <td className="px-4 py-3 text-sm text-blue-400 font-semibold">{p.leads}</td>
                  <td className="px-4 py-3 text-sm text-cyan-400 font-semibold">{p.attendance}%</td>
                  <td className="px-4 py-3 text-sm text-primary">{p.calls}</td>
                  <td className="px-4 py-3 text-sm text-primary">{p.talkTime}m</td>
                  <td className="px-4 py-3 text-sm text-amber-400 font-semibold">{formatINR(p.arpu)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-[rgb(var(--bg-elevated))] rounded-full h-2">
                        <div className={cn('h-2 rounded-full', p.achievement >= 100 ? 'bg-emerald-500' : p.achievement >= 75 ? 'bg-amber-500' : 'bg-red-500')} style={{ width: `${Math.min(p.achievement, 100)}%` }} />
                      </div>
                      <span className="text-sm font-semibold text-primary">{p.achievement}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm font-bold text-blue-400">{p.overall}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
