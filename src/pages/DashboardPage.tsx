import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore, hasRole } from '../stores/authStore';
import { formatINR, formatINRShort, percentage, getBillingCycle, getBillingCycleLabel, cn, getAllBillingCycles } from '../lib/utils';
import { format, startOfWeek, endOfWeek } from 'date-fns';
import {
  IndianRupee, Users, CalendarCheck, Phone, Clock, TrendingUp,
  Award, ArrowUpRight, ArrowDownRight, ChevronLeft, ChevronRight, Filter,
  BarChart3, Activity, Gauge,
} from 'lucide-react';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
} from 'recharts';
import Spinner from '../components/ui/Spinner';
import type { Profile } from '../types';

// Theme-aware chart colors that work in both light and dark mode
const CHART_COLORS = [
  'var(--chart-primary, #3b82f6)',
  'var(--chart-success, #10b981)',
  'var(--chart-warning, #f59e0b)',
  'var(--chart-purple, #8b5cf6)',
  'var(--chart-pink, #ec4899)',
  'var(--chart-cyan, #06b6d4)',
];

interface DashboardData {
  totalRevenue: number;
  totalTarget: number;
  leadsAssigned: number;
  leadsWon: number;
  attendancePct: number;
  totalCalls: number;
  totalTalkTime: number;
  weeklyRevenue: number;
  monthlyRevenue: number;
  achievementPct: number;
  arpu: number;
  bestPerformer: { name: string; pct: number } | null;
  revenueTrend: Array<{ cycle: string; achieved: number; target: number }>;
  attendanceTrend: Array<{ date: string; present: number; absent: number }>;
  kpiTrend: Array<{ metric: string; score: number }>;
  callsTrend: Array<{ date: string; calls: number; duration: number }>;
  targetVsAchievement: Array<{ name: string; target: number; achieved: number }>;
  batchWiseRevenue: Array<{ source: string; value: number; color: string }>;
  topPerformers: Array<{ name: string; achieved: number; target: number; pct: number }>;
}

export default function DashboardPage() {
  const { profile } = useAuthStore();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [cycleOffset, setCycleOffset] = useState(0);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedMember, setSelectedMember] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);

  const cycleDate = new Date();
  cycleDate.setMonth(cycleDate.getMonth() + cycleOffset);
  const cycle = getBillingCycle(cycleDate);
  const cycleLabel = getBillingCycleLabel(cycleDate);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const cs = cycle.start.toISOString().split('T')[0];
      const ce = cycle.end.toISOString().split('T')[0];
      const memberFilter = selectedMember !== 'all' ? selectedMember : (profile?.role === 'team_member' ? profile.id : undefined);

      // Primary revenue source: lead_assignments
      let leadsQuery = supabase.from('lead_assignments').select('*, profile:profiles(full_name, email)')
        .gte('billing_cycle_start', cs).lte('billing_cycle_end', ce);
      if (memberFilter) leadsQuery = leadsQuery.eq('user_id', memberFilter);

      let attendanceQuery = supabase.from('attendance_entries').select('user_id, date, status')
        .gte('date', cs).lte('date', ce);
      if (memberFilter) attendanceQuery = attendanceQuery.eq('user_id', memberFilter);

      let callsQuery = supabase.from('call_logs').select('user_id, duration_seconds, called_at')
        .gte('called_at', cs).lte('called_at', ce + 'T23:59:59');
      if (memberFilter) callsQuery = callsQuery.eq('user_id', memberFilter);

      let kpiQuery = supabase.from('kpi_metrics').select('user_id, metric_name, target_value, achieved_value, weight')
        .gte('billing_cycle_start', cs).lte('billing_cycle_end', ce);
      if (memberFilter) kpiQuery = kpiQuery.eq('user_id', memberFilter);

      // Also get monthly_targets for target data
      let targetsQuery = supabase.from('monthly_targets').select('user_id, target_value, category')
        .gte('billing_cycle_start', cs).lte('billing_cycle_end', ce);
      if (memberFilter) targetsQuery = targetsQuery.eq('user_id', memberFilter);

      const [leadsRes, attendanceRes, callsRes, kpiRes, profilesRes, targetsRes] = await Promise.all([
        leadsQuery,
        attendanceQuery,
        callsQuery,
        kpiQuery,
        hasRole('admin') ? supabase.from('profiles').select('id, full_name, email').eq('is_active', true) : Promise.resolve({ data: profile ? [profile] : [] }),
        targetsQuery,
      ]);

      const leads = leadsRes.data || [];
      const attendances = attendanceRes.data || [];
      const calls = callsRes.data || [];
      const kpis = kpiRes.data || [];
      const monthlyTargets = targetsRes.data || [];

      setProfiles((profilesRes.data as Profile[]) || []);

      // Revenue comes from lead_assignments (primary source)
      const totalRevenue = leads.reduce((s: number, l: any) => s + Number(l.revenue), 0);
      const totalLeadsAssigned = leads.reduce((s: number, l: any) => s + Number(l.leads_assigned), 0);
      const revenueTarget = monthlyTargets
        .filter((t: any) => t.category === 'revenue')
        .reduce((s: number, t: any) => s + Number(t.target_value), 0);
      const totalTarget = revenueTarget || (profilesRes.data?.length || 1) * 100000;

      // Attendance: week_off does NOT reduce percentage
      const countedAtt = attendances.filter((a: any) => a.status !== 'week_off');
      const presentCount = countedAtt.filter((a: any) => a.status === 'present' || a.status === 'half_day').length;
      const attendancePct = countedAtt.length > 0 ? percentage(presentCount, countedAtt.length) : 0;
      const totalCalls = calls.length;
      const totalTalkTime = calls.reduce((s: number, c: any) => s + Number(c.duration_seconds), 0);

      // Weekly revenue (current week)
      const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
      const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });
      const weeklyRevenue = leads
        .filter((l: any) => {
          const d = new Date(l.assigned_date);
          return d >= weekStart && d <= weekEnd;
        })
        .reduce((s: number, l: any) => s + Number(l.revenue), 0);

      // Monthly revenue = total revenue for the cycle
      const monthlyRevenue = totalRevenue;
      const achievementPct = percentage(totalRevenue, totalTarget);

      // FIXED: ARPU = Total Revenue / Total Leads Assigned (NOT multiplied by 100)
      // Example: ₹3,58,248 ÷ 391 = ₹916
      const arpu = totalLeadsAssigned > 0 ? totalRevenue / totalLeadsAssigned : 0;

      // Best Performer (from lead_assignments revenue)
      const performerMap: Record<string, { name: string; achieved: number; target: number }> = {};
      leads.forEach((l: any) => {
        const name = (l.profile as any)?.full_name || (l.profile as any)?.email || 'Unknown';
        if (!performerMap[l.user_id]) performerMap[l.user_id] = { name, achieved: 0, target: 0 };
        performerMap[l.user_id].achieved += Number(l.revenue);
      });
      // Add targets
      monthlyTargets.filter((t: any) => t.category === 'revenue').forEach((t: any) => {
        if (performerMap[t.user_id]) performerMap[t.user_id].target += Number(t.target_value);
      });
      // Set default targets for members without targets
      Object.keys(performerMap).forEach((uid) => {
        if (!performerMap[uid].target) performerMap[uid].target = 100000;
      });

      const topPerformers = Object.values(performerMap)
        .map((p) => ({ ...p, pct: percentage(p.achieved, p.target) }))
        .sort((a, b) => b.pct - a.pct);
      const bestPerformer = topPerformers[0] ? { name: topPerformers[0].name, pct: topPerformers[0].pct } : null;

      // Revenue Trend (last 6 cycles)
      const trendCycles = getAllBillingCycles(6);
      const revenueTrend = trendCycles.map((c) => ({
        cycle: c.label.split(' - ')[0]?.substring(0, 5) || c.start.substring(5, 10),
        achieved: leads.filter((l: any) => l.billing_cycle_start >= c.start && l.billing_cycle_end <= c.end)
          .reduce((s: number, l: any) => s + Number(l.revenue), 0),
        target: monthlyTargets.filter((t: any) => t.billing_cycle_start >= c.start && t.billing_cycle_end <= c.end && t.category === 'revenue')
          .reduce((s: number, t: any) => s + Number(t.target_value), 0),
      }));

      // Attendance Trend (last 7 days) - week_off excluded from percentage
      const attTrend: Array<{ date: string; present: number; absent: number }> = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const ds = d.toISOString().split('T')[0];
        const dayAtt = attendances.filter((a: any) => a.date === ds);
        attTrend.push({
          date: format(d, 'EEE'),
          present: dayAtt.filter((a: any) => a.status === 'present' || a.status === 'half_day').length,
          absent: dayAtt.filter((a: any) => a.status === 'absent').length,
        });
      }

      // KPI Trend
      const kpiTrend = kpis.map((k: any) => ({
        metric: k.metric_name.length > 14 ? k.metric_name.substring(0, 14) + '..' : k.metric_name,
        score: percentage(Number(k.achieved_value), Number(k.target_value)),
      }));

      // Calls Trend (last 7 days)
      const callsTrend: Array<{ date: string; calls: number; duration: number }> = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const ds = d.toISOString().split('T')[0];
        const dayCalls = calls.filter((c: any) => (c.called_at || '').startsWith(ds));
        callsTrend.push({
          date: format(d, 'EEE'),
          calls: dayCalls.length,
          duration: Math.round(dayCalls.reduce((s: number, c: any) => s + Number(c.duration_seconds), 0) / 60),
        });
      }

      // Target vs Achievement (by member)
      const targetVsAchievement = topPerformers.slice(0, 8).map((p) => ({
        name: p.name.length > 10 ? p.name.substring(0, 10) + '..' : p.name,
        target: Number(p.target),
        achieved: Number(p.achieved),
      }));

      // Batch-wise Revenue (by batch_name from lead_assignments)
      const batchMap: Record<string, number> = {};
      leads.forEach((l: any) => {
        const key = l.batch_name || 'Unassigned';
        batchMap[key] = (batchMap[key] || 0) + Number(l.revenue);
      });
      const batchWiseRevenue = Object.entries(batchMap).map(([name, value], i) => ({
        source: name,
        value,
        color: CHART_COLORS[i % CHART_COLORS.length],
      }));

      setData({
        totalRevenue, totalTarget, leadsAssigned: totalLeadsAssigned, leadsWon: 0, attendancePct,
        totalCalls, totalTalkTime, weeklyRevenue, monthlyRevenue,
        achievementPct, arpu, bestPerformer,
        revenueTrend, attendanceTrend: attTrend, kpiTrend, callsTrend,
        targetVsAchievement, batchWiseRevenue, topPerformers: topPerformers.slice(0, 5),
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [cycleOffset, profile, selectedMember]);

  // FIXED: Changed from [loadDashboard] to [cycleOffset, profile, selectedMember]
  // This prevents the infinite re-rendering loop that was causing constant API calls
  useEffect(() => {
    loadDashboard();
  }, [cycleOffset, profile, selectedMember]);

  const formatDuration = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hrs > 0) return `${hrs}h ${mins}m`;
    return `${mins}m`;
  };

  if (loading || !data) return <div className="flex items-center justify-center min-h-[60vh]"><Spinner size="lg" /></div>;

  // Theme-aware tooltip style using CSS variables
  const tooltipStyle = {
    background: 'rgb(var(--bg-elevated))',
    border: '1px solid rgb(var(--border-default))',
    borderRadius: '8px',
    color: 'rgb(var(--text-primary))',
    fontSize: '12px'
  };

  // Theme-aware chart colors
  const chartGridColor = 'rgb(var(--border-default))';
  const chartAxisColor = 'rgb(var(--text-muted))';
  const chartPrimaryColor = 'rgb(var(--chart-primary, #3b82f6))';
  const chartSuccessColor = 'rgb(var(--chart-success, #10b981))';
  const chartWarningColor = 'rgb(var(--chart-warning, #f59e0b))';
  const chartMutedColor = 'rgb(var(--text-muted))';

  return (
    <div className="space-y-6">
      {/* Header + Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary">Dashboard</h1>
          <p className="text-secondary text-sm mt-1">Billing Cycle: {cycleLabel}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setCycleOffset((p) => p - 1)} className="btn-ghost p-2 rounded-lg transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={() => setCycleOffset(0)} className="btn-primary px-3 py-2 text-sm rounded-lg transition-colors">Current</button>
          <button onClick={() => setCycleOffset((p) => p + 1)} className="btn-ghost p-2 rounded-lg transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
          {hasRole('admin') && (
            <button onClick={() => setShowFilters(!showFilters)} className={cn('px-3 py-2 text-sm rounded-lg transition-colors flex items-center gap-2', showFilters ? 'btn-primary' : 'btn-ghost')}>
              <Filter className="w-4 h-4" />Filters
            </button>
          )}
        </div>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div className="card p-4 flex flex-wrap items-center gap-4" style={{ borderLeft: '3px solid rgb(var(--border-accent))' }}>
          <div>
            <label className="block text-xs text-muted mb-1">Team Member</label>
            <select value={selectedMember} onChange={(e) => setSelectedMember(e.target.value)}
              className="input px-3 py-2 text-sm">
              <option value="all">All Members</option>
              {profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">Cycle</label>
            <span className="text-sm text-primary px-3 py-2 rounded-lg" style={{ background: 'rgb(var(--bg-secondary))' }}>{cycleLabel}</span>
          </div>
        </div>
      )}

      {/* KPI Cards - Row 1 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KPICard title="Total Revenue" value={formatINRShort(data.totalRevenue)} icon={IndianRupee} color="blue"
          trend={data.achievementPct} trendLabel="of target" />
        <KPICard title="Leads Assigned" value={data.leadsAssigned.toString()} icon={Users} color="emerald" />
        <KPICard title="Attendance %" value={`${data.attendancePct}%`} icon={CalendarCheck} color="cyan" />
        <KPICard title="Total Calls" value={data.totalCalls.toString()} icon={Phone} color="amber" />
        <KPICard title="Talk Time" value={formatDuration(data.totalTalkTime)} icon={Clock} color="purple" />
      </div>

      {/* KPI Cards - Row 2 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KPICard title="Weekly Revenue" value={formatINRShort(data.weeklyRevenue)} icon={TrendingUp} color="blue" />
        <KPICard title="Monthly Revenue" value={formatINRShort(data.monthlyRevenue)} icon={BarChart3} color="emerald" />
        <KPICard title="Achievement %" value={`${data.achievementPct}%`} icon={Gauge} color="amber"
          trend={data.achievementPct} trendLabel="vs target" />
        <KPICard title="ARPU" value={formatINRShort(data.arpu)} icon={Activity} color="cyan" />
        <KPICard title="Best Performer" value={data.bestPerformer?.name || '-'} icon={Award} color="rose"
          subtext={data.bestPerformer ? `${data.bestPerformer.pct}% achievement` : undefined} />
      </div>

      {/* Achievement Bar */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-primary">Cycle Achievement</h3>
          <span className="text-2xl font-bold" style={{ color: 'rgb(var(--chart-primary, #3b82f6))' }}>{data.achievementPct}%</span>
        </div>
        <div className="w-full rounded-full h-3" style={{ background: 'rgb(var(--bg-secondary))' }}>
          <div className="h-3 rounded-full transition-all duration-500" style={{
            width: `${Math.min(data.achievementPct, 100)}%`,
            background: data.achievementPct >= 100
              ? 'linear-gradient(90deg, rgb(var(--chart-success, #10b981)), rgb(var(--chart-success-light, #34d399)))'
              : 'linear-gradient(90deg, rgb(var(--chart-primary, #3b82f6)), rgb(var(--chart-primary-light, #60a5fa)))',
          }} />
        </div>
        <div className="flex justify-between mt-2 text-xs text-muted">
          <span>{formatINR(data.totalRevenue)} achieved</span>
          <span>{formatINR(data.totalTarget)} target</span>
        </div>
      </div>

      {/* Charts Row 1: Revenue Trends + Target vs Achievement */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-6">
          <h3 className="text-sm font-semibold text-primary mb-4">Revenue Trends</h3>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={data.revenueTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} />
              <XAxis dataKey="cycle" stroke={chartAxisColor} tick={{ fontSize: 10, fill: chartAxisColor }} />
              <YAxis stroke={chartAxisColor} tick={{ fontSize: 10, fill: chartAxisColor }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => formatINR(Number(v))} />
              <Legend />
              <Area type="monotone" dataKey="achieved" stroke={chartPrimaryColor} fill={chartPrimaryColor} fillOpacity={0.1} name="Achieved" />
              <Area type="monotone" dataKey="target" stroke={chartMutedColor} fill={chartMutedColor} fillOpacity={0.05} name="Target" strokeDasharray="5 5" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-6">
          <h3 className="text-sm font-semibold text-primary mb-4">Target vs Achievement</h3>
          {data.targetVsAchievement.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.targetVsAchievement}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} />
                <XAxis dataKey="name" stroke={chartAxisColor} tick={{ fontSize: 10, fill: chartAxisColor }} />
                <YAxis stroke={chartAxisColor} tick={{ fontSize: 10, fill: chartAxisColor }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => formatINR(Number(v))} />
                <Legend />
                <Bar dataKey="target" fill={chartMutedColor} name="Target" radius={[4, 4, 0, 0]} />
                <Bar dataKey="achieved" fill={chartPrimaryColor} name="Achieved" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[260px] flex items-center justify-center text-muted text-sm">No data</div>
          )}
        </div>
      </div>

      {/* Charts Row 2: Attendance + Calls + KPI */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card p-6">
          <h3 className="text-sm font-semibold text-primary mb-4">Attendance Trends</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.attendanceTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} />
              <XAxis dataKey="date" stroke={chartAxisColor} tick={{ fontSize: 10, fill: chartAxisColor }} />
              <YAxis stroke={chartAxisColor} tick={{ fontSize: 10, fill: chartAxisColor }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="present" fill={chartSuccessColor} name="Present" radius={[4, 4, 0, 0]} />
              <Bar dataKey="absent" fill="rgb(var(--chart-danger, #ef4444))" name="Absent" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-6">
          <h3 className="text-sm font-semibold text-primary mb-4">Calls Trends</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data.callsTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} />
              <XAxis dataKey="date" stroke={chartAxisColor} tick={{ fontSize: 10, fill: chartAxisColor }} />
              <YAxis stroke={chartAxisColor} tick={{ fontSize: 10, fill: chartAxisColor }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend />
              <Line type="monotone" dataKey="calls" stroke={chartWarningColor} name="Calls" strokeWidth={2} dot={{ r: 3, fill: chartWarningColor }} />
              <Line type="monotone" dataKey="duration" stroke={chartPrimaryColor} name="Duration (min)" strokeWidth={2} dot={{ r: 3, fill: chartPrimaryColor }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-6">
          <h3 className="text-sm font-semibold text-primary mb-4">KPI Trends</h3>
          {data.kpiTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.kpiTrend} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} />
                <XAxis type="number" domain={[0, 100]} stroke={chartAxisColor} tick={{ fontSize: 10, fill: chartAxisColor }} tickFormatter={(v) => `${v}%`} />
                <YAxis type="category" dataKey="metric" stroke={chartAxisColor} tick={{ fontSize: 9, fill: chartAxisColor }} width={80} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => `${Number(v)}%`} />
                <Bar dataKey="score" fill={chartPrimaryColor} name="Score %" radius={[0, 4, 4, 0]}>
                  {data.kpiTrend.map((entry, i) => (
                    <Cell key={i} fill={entry.score >= 90 ? chartSuccessColor : entry.score >= 70 ? chartWarningColor : 'rgb(var(--chart-danger, #ef4444))'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-muted text-sm">No KPI data</div>
          )}
        </div>
      </div>

      {/* Charts Row 3: Batch-wise Revenue + Top Performers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-6">
          <h3 className="text-sm font-semibold text-primary mb-4">Revenue by Batch</h3>
          {data.batchWiseRevenue.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={data.batchWiseRevenue} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={3} dataKey="value">
                  {data.batchWiseRevenue.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => formatINR(Number(v))} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[260px] flex items-center justify-center text-muted text-sm">No revenue data</div>
          )}
          <div className="flex flex-wrap gap-3 mt-2">
            {data.batchWiseRevenue.map((s) => (
              <div key={s.source} className="flex items-center gap-2 text-xs text-secondary">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />{s.source}
              </div>
            ))}
          </div>
        </div>

        <div className="card p-6">
          <h3 className="text-sm font-semibold text-primary mb-4">Top Performers</h3>
          {data.topPerformers.length > 0 ? (
            <div className="space-y-3">
              {data.topPerformers.map((p, i) => (
                <div key={i} className="flex items-center gap-4">
                  <span className={cn('w-7 h-7 flex items-center justify-center rounded-full text-xs font-bold badge',
                    i === 0 ? 'badge-gold' : i === 1 ? 'badge-silver' : i === 2 ? 'badge-bronze' : 'badge')}>
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-primary truncate">{p.name}</span>
                      <span className={cn('text-sm font-semibold', p.pct >= 100 ? 'text-success' : p.pct >= 75 ? 'text-warning' : 'text-danger')}>{p.pct}%</span>
                    </div>
                    <div className="w-full rounded-full h-1.5" style={{ background: 'rgb(var(--bg-secondary))' }}>
                      <div className={cn('h-1.5 rounded-full', p.pct >= 100 ? 'bg-success' : p.pct >= 75 ? 'bg-warning' : 'bg-danger')}
                        style={{ width: `${Math.min(p.pct, 100)}%` }} />
                    </div>
                    <div className="flex justify-between mt-1 text-xs text-muted">
                      <span>{formatINR(p.achieved)}</span>
                      <span>{formatINR(p.target)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted text-sm text-center py-8">No performance data for this cycle</p>
          )}
        </div>
      </div>
    </div>
  );
}

function KPICard({ title, value, icon: Icon, trend, trendLabel, subtext, color }: {
  title: string; value: string; icon: React.ElementType; trend?: number; trendLabel?: string; subtext?: string; color: string;
}) {
  // Theme-aware color mapping using CSS custom properties
  const colorMap: Record<string, { bgVar: string; colorVar: string }> = {
    blue: { bgVar: 'var(--color-blue-bg, rgba(59, 130, 246, 0.1))', colorVar: 'var(--color-blue, #3b82f6)' },
    emerald: { bgVar: 'var(--color-emerald-bg, rgba(16, 185, 129, 0.1))', colorVar: 'var(--color-emerald, #10b981)' },
    amber: { bgVar: 'var(--color-amber-bg, rgba(245, 158, 11, 0.1))', colorVar: 'var(--color-amber, #f59e0b)' },
    cyan: { bgVar: 'var(--color-cyan-bg, rgba(6, 182, 212, 0.1))', colorVar: 'var(--color-cyan, #06b6d4)' },
    purple: { bgVar: 'var(--color-purple-bg, rgba(139, 92, 246, 0.1))', colorVar: 'var(--color-purple, #8b5cf6)' },
    rose: { bgVar: 'var(--color-rose-bg, rgba(244, 63, 94, 0.1))', colorVar: 'var(--color-rose, #f43f5e)' },
  };
  const c = colorMap[color] || colorMap.blue;

  return (
    <div className="card p-4 hover:border-accent transition-colors">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-medium text-muted uppercase tracking-wider">{title}</span>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `rgb(${c.bgVar})` }}>
          <Icon className="w-4 h-4" style={{ color: `rgb(${c.colorVar})` }} />
        </div>
      </div>
      <p className="text-xl font-bold text-primary truncate">{value}</p>
      {trend !== undefined && trendLabel && (
        <div className="flex items-center gap-1 mt-1">
          {trend >= 0 ? <ArrowUpRight className="w-3 h-3 text-success" /> : <ArrowDownRight className="w-3 h-3 text-danger" />}
          <span className={cn('text-[10px] font-medium', trend >= 0 ? 'text-success' : 'text-danger')}>
            {trend}% {trendLabel}
          </span>
        </div>
      )}
      {subtext && <p className="text-[10px] text-muted mt-1">{subtext}</p>}
    </div>
  );
}