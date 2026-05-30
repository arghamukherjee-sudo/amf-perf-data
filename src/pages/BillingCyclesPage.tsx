import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { hasRole } from '../stores/authStore';
import type { BillingCycle } from '../types';
import {
  Lock, Unlock, Plus, X, Check, Archive, RefreshCw,
  BarChart3, IndianRupee, Users, CalendarCheck, GitCompare,
  ChevronDown, TrendingUp, TrendingDown, Minus
} from 'lucide-react';
import toast from 'react-hot-toast';
import Spinner from '../components/ui/Spinner';
import { format } from 'date-fns';
import { formatINR, percentage, cn } from '../lib/utils';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell
} from 'recharts';

interface CycleStats {
  totalRevenue: number;
  totalLeads: number;
  attendancePct: number;
}

interface CycleWithStats extends BillingCycle {
  stats: CycleStats;
  status: 'current' | 'future' | 'archived';
}

export default function BillingCyclesPage() {
  const [cycles, setCycles] = useState<CycleWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  const [compareSelection, setCompareSelection] = useState<string[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selectedCycleFilter, setSelectedCycleFilter] = useState<string>('all');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: cyclesData } = await supabase
        .from('billing_cycles')
        .select('*')
        .order('cycle_start', { ascending: false });

      if (!cyclesData) {
        setCycles([]);
        setLoading(false);
        return;
      }

      const today = new Date().toISOString().split('T')[0];

      // Fetch stats for each cycle
      const cyclesWithStats: CycleWithStats[] = await Promise.all(
        cyclesData.map(async (cycle) => {
          const cs = cycle.cycle_start;
          const ce = cycle.cycle_end;

          // Get revenue from lead_assignments
          const { data: leadsData } = await supabase
            .from('lead_assignments')
            .select('revenue, leads_assigned')
            .gte('billing_cycle_start', cs)
            .lte('billing_cycle_end', ce);

          // Get attendance
          const { data: attData } = await supabase
            .from('attendance_entries')
            .select('status')
            .gte('date', cs)
            .lte('date', ce);

          const totalRevenue = (leadsData || []).reduce((s, l) => s + Number(l.revenue || 0), 0);
          const totalLeads = (leadsData || []).reduce((s, l) => s + Number(l.leads_assigned || 0), 0);

          // Attendance percentage (excluding week_off)
          const countedAtt = (attData || []).filter(a => a.status !== 'week_off');
          const presentCount = countedAtt.filter(a => a.status === 'present' || a.status === 'half_day').length;
          const attendancePct = countedAtt.length > 0 ? percentage(presentCount, countedAtt.length) : 0;

          // Determine status
          let status: 'current' | 'future' | 'archived' = 'archived';
          if (cycle.is_current) {
            status = 'current';
          } else if (cycle.cycle_start > today) {
            status = 'future';
          } else {
            status = 'archived';
          }

          return {
            ...cycle,
            stats: { totalRevenue, totalLeads, attendancePct },
            status,
          };
        })
      );

      setCycles(cyclesWithStats);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load billing cycles');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleToggleLock = async (cycle: BillingCycle) => {
    try {
      const { error } = await supabase
        .from('billing_cycles')
        .update({ is_locked: !cycle.is_locked })
        .eq('id', cycle.id);
      if (error) throw error;
      toast.success(cycle.is_locked ? 'Cycle unlocked' : 'Cycle locked');
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update cycle');
    }
  };

  const handleSetCurrent = async (id: string) => {
    try {
      // Unset all current first
      await supabase
        .from('billing_cycles')
        .update({ is_current: false })
        .eq('is_current', true);
      const { error } = await supabase
        .from('billing_cycles')
        .update({ is_current: true })
        .eq('id', id);
      if (error) throw error;
      toast.success('Current cycle updated');
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update current cycle');
    }
  };

  const handleArchive = async (cycle: BillingCycle) => {
    if (cycle.is_current) {
      toast.error('Cannot archive the current cycle');
      return;
    }
    try {
      const { error } = await supabase
        .from('billing_cycles')
        .update({ is_locked: true })
        .eq('id', cycle.id);
      if (error) throw error;
      toast.success('Cycle archived (locked)');
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to archive cycle');
    }
  };

  const handleSaveNotes = async (id: string) => {
    try {
      const { error } = await supabase
        .from('billing_cycles')
        .update({ notes: editNotes })
        .eq('id', id);
      if (error) throw error;
      toast.success('Notes saved');
      setEditingId(null);
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save notes');
    }
  };

  const handleAdd = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const startDate = (form.elements.namedItem('cycle_start') as HTMLInputElement).value;
    const endDate = (form.elements.namedItem('cycle_end') as HTMLInputElement).value;
    const label = (form.elements.namedItem('label') as HTMLInputElement).value;

    if (!startDate || !endDate || !label) {
      toast.error('All fields required');
      return;
    }

    try {
      const { error } = await supabase.from('billing_cycles').insert({
        cycle_start: startDate,
        cycle_end: endDate,
        label,
        is_current: false,
        is_locked: false,
      });
      if (error) throw error;
      toast.success('Cycle created successfully');
      setShowAdd(false);
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create cycle');
    }
  };

  // Filter cycles based on selection
  const filteredCycles = cycles.filter(c => {
    if (selectedCycleFilter === 'all') return true;
    return c.status === selectedCycleFilter;
  });

  // Get current cycle for dropdown
  const currentCycle = cycles.find(c => c.is_current);

  // Handle compare selection
  const toggleCompareSelection = (id: string) => {
    if (compareSelection.includes(id)) {
      setCompareSelection(compareSelection.filter(cid => cid !== id));
    } else if (compareSelection.length < 2) {
      setCompareSelection([...compareSelection, id]);
    } else {
      toast.error('Select only 2 cycles to compare');
    }
  };

  // Get cycles for comparison
  const compareCycles = cycles.filter(c => compareSelection.includes(c.id));

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary">Billing Cycles</h1>
          <p className="text-secondary text-sm mt-1">Manage billing periods (26th to 25th)</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {hasRole('admin') && (
            <>
              <button
                onClick={() => setShowAdd(true)}
                className="btn-primary flex items-center gap-2"
              >
                <Plus className="w-4 h-4" /> New Cycle
              </button>
              <button
                onClick={() => {
                  if (compareSelection.length === 2) {
                    setShowCompare(true);
                  } else {
                    toast.error('Select exactly 2 cycles to compare');
                  }
                }}
                disabled={compareSelection.length !== 2}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-[rgb(var(--bg-elevated))] disabled:text-secondary text-white text-sm rounded-lg transition-colors flex items-center gap-2"
              >
                <GitCompare className="w-4 h-4" /> Compare
              </button>
            </>
          )}
          <button
            onClick={loadData}
            className="btn-secondary p-2"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Cycle Dropdown Filter */}
      <div className="relative inline-block">
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="px-4 py-2.5 card rounded-xl text-sm flex items-center gap-2 transition-colors"
        >
          <CalendarCheck className="w-4 h-4 text-blue-400" />
          {selectedCycleFilter === 'all' ? 'All Cycles' :
           selectedCycleFilter === 'current' ? 'Current Cycle' :
           selectedCycleFilter === 'future' ? 'Future Cycles' : 'Archived Cycles'}
          <ChevronDown className={cn('w-4 h-4 transition-transform', dropdownOpen && 'rotate-180')} />
        </button>
        {dropdownOpen && (
          <div className="absolute top-full left-0 mt-2 w-48 card rounded-xl shadow-xl z-50 overflow-hidden">
            {['all', 'current', 'future', 'archived'].map(filter => (
              <button
                key={filter}
                onClick={() => {
                  setSelectedCycleFilter(filter);
                  setDropdownOpen(false);
                }}
                className={cn(
                  'w-full px-4 py-2.5 text-sm text-left hover:bg-[rgb(var(--bg-elevated))] transition-colors',
                  selectedCycleFilter === filter ? 'bg-blue-600/10 text-blue-400' : 'text-secondary'
                )}
              >
                {filter === 'all' ? 'All Cycles' :
                 filter === 'current' ? 'Current Cycle' :
                 filter === 'future' ? 'Future Cycles' : 'Archived Cycles'}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Current Cycle Quick Stats */}
      {currentCycle && (
        <div className="bg-gradient-to-r from-blue-600/10 to-purple-600/10 border border-blue-600/30 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-blue-600/20 rounded-xl flex items-center justify-center">
              <CalendarCheck className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-xs text-blue-400 uppercase tracking-wider font-medium">Current Cycle</p>
              <h2 className="text-lg font-bold text-primary">{currentCycle.label}</h2>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="card rounded-xl p-4" style={{ background: 'rgba(var(--bg-card), 0.5)' }}>
              <div className="flex items-center gap-2 mb-1">
                <IndianRupee className="w-4 h-4 text-emerald-400" />
                <span className="text-[10px] text-secondary uppercase tracking-wider">Revenue</span>
              </div>
              <p className="text-xl font-bold text-emerald-400">{formatINR(currentCycle.stats.totalRevenue)}</p>
            </div>
            <div className="card rounded-xl p-4" style={{ background: 'rgba(var(--bg-card), 0.5)' }}>
              <div className="flex items-center gap-2 mb-1">
                <Users className="w-4 h-4 text-blue-400" />
                <span className="text-[10px] text-secondary uppercase tracking-wider">Leads</span>
              </div>
              <p className="text-xl font-bold text-blue-400">{currentCycle.stats.totalLeads}</p>
            </div>
            <div className="card rounded-xl p-4" style={{ background: 'rgba(var(--bg-card), 0.5)' }}>
              <div className="flex items-center gap-2 mb-1">
                <BarChart3 className="w-4 h-4 text-cyan-400" />
                <span className="text-[10px] text-secondary uppercase tracking-wider">Attendance</span>
              </div>
              <p className="text-xl font-bold text-cyan-400">{currentCycle.stats.attendancePct}%</p>
            </div>
            <div className="card rounded-xl p-4" style={{ background: 'rgba(var(--bg-card), 0.5)' }}>
              <div className="flex items-center gap-2 mb-1">
                <CalendarCheck className="w-4 h-4 text-amber-400" />
                <span className="text-[10px] text-secondary uppercase tracking-wider">Period</span>
              </div>
              <p className="text-sm font-medium text-amber-400">
                {format(new Date(currentCycle.cycle_start), 'dd MMM')} - {format(new Date(currentCycle.cycle_end), 'dd MMM yyyy')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Add Cycle Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form
            onSubmit={handleAdd}
            className="card rounded-2xl p-6 w-full max-w-md space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-primary">Create New Billing Cycle</h2>
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="text-secondary hover:text-primary transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div>
              <label className="block text-sm font-medium text-secondary mb-1">Label</label>
              <input
                name="label"
                type="text"
                required
                className="input w-full px-3 py-2 text-sm"
                placeholder="e.g., May 2026"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-secondary mb-1">Cycle Start</label>
                <input
                  name="cycle_start"
                  type="date"
                  required
                  className="input w-full px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-secondary mb-1">Cycle End</label>
                <input
                  name="cycle_end"
                  type="date"
                  required
                  className="input w-full px-3 py-2 text-sm"
                />
              </div>
            </div>
            <button
              type="submit"
              className="btn-primary w-full py-2.5 font-semibold rounded-xl text-sm transition-colors"
            >
              Create Cycle
            </button>
          </form>
        </div>
      )}

      {/* Compare Modal */}
      {showCompare && compareCycles.length === 2 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto">
          <div className="card rounded-2xl p-6 w-full max-w-4xl space-y-6 my-8">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-primary flex items-center gap-2">
                <GitCompare className="w-5 h-5 text-purple-400" />
                Cycle Comparison
              </h2>
              <button
                onClick={() => setShowCompare(false)}
                className="text-secondary hover:text-primary transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Side-by-side Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {compareCycles.map((cycle, idx) => (
                <div
                  key={cycle.id}
                  className={cn(
                    'rounded-2xl border p-5',
                    idx === 0 ? 'bg-blue-600/5 border-blue-600/30' : 'bg-purple-600/5 border-purple-600/30'
                  )}
                >
                  <div className="flex items-center gap-2 mb-4">
                    <h3 className="text-sm font-semibold text-primary">{cycle.label}</h3>
                    {cycle.is_current && (
                      <span className="px-2 py-0.5 bg-blue-600/20 text-blue-400 text-[10px] font-semibold rounded-full">
                        CURRENT
                      </span>
                    )}
                    <span className={cn(
                      'px-2 py-0.5 text-[10px] font-semibold rounded-full',
                      cycle.status === 'current' ? 'bg-emerald-600/20 text-emerald-400' :
                      cycle.status === 'future' ? 'bg-amber-600/20 text-amber-400' :
                      'bg-[rgb(var(--bg-elevated))] text-secondary'
                    )}>
                      {cycle.status.toUpperCase()}
                    </span>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center p-3 card rounded-xl" style={{ background: 'rgba(var(--bg-card), 0.5)' }}>
                      <div className="flex items-center gap-2">
                        <IndianRupee className="w-4 h-4 text-emerald-400" />
                        <span className="text-sm text-secondary">Revenue</span>
                      </div>
                      <span className="text-lg font-bold text-emerald-400">
                        {formatINR(cycle.stats.totalRevenue)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center p-3 card rounded-xl" style={{ background: 'rgba(var(--bg-card), 0.5)' }}>
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-blue-400" />
                        <span className="text-sm text-secondary">Total Leads</span>
                      </div>
                      <span className="text-lg font-bold text-blue-400">
                        {cycle.stats.totalLeads}
                      </span>
                    </div>
                    <div className="flex justify-between items-center p-3 card rounded-xl" style={{ background: 'rgba(var(--bg-card), 0.5)' }}>
                      <div className="flex items-center gap-2">
                        <BarChart3 className="w-4 h-4 text-cyan-400" />
                        <span className="text-sm text-secondary">Attendance</span>
                      </div>
                      <span className="text-lg font-bold text-cyan-400">
                        {cycle.stats.attendancePct}%
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Comparison Summary */}
            <div className="card rounded-2xl p-6" style={{ background: 'rgba(var(--bg-card), 0.5)' }}>
              <h4 className="text-sm font-semibold text-primary mb-4">Comparison Summary</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <ComparisonMetric
                  label="Revenue"
                  value1={compareCycles[0].stats.totalRevenue}
                  value2={compareCycles[1].stats.totalRevenue}
                  format="currency"
                  cycle1Label={compareCycles[0].label}
                  cycle2Label={compareCycles[1].label}
                />
                <ComparisonMetric
                  label="Leads"
                  value1={compareCycles[0].stats.totalLeads}
                  value2={compareCycles[1].stats.totalLeads}
                  format="number"
                  cycle1Label={compareCycles[0].label}
                  cycle2Label={compareCycles[1].label}
                />
                <ComparisonMetric
                  label="Attendance"
                  value1={compareCycles[0].stats.attendancePct}
                  value2={compareCycles[1].stats.attendancePct}
                  format="percentage"
                  cycle1Label={compareCycles[0].label}
                  cycle2Label={compareCycles[1].label}
                />
              </div>
            </div>

            {/* Comparison Chart */}
            <div className="card rounded-2xl p-6" style={{ background: 'rgba(var(--bg-card), 0.5)' }}>
              <h4 className="text-sm font-semibold text-primary mb-4">Visual Comparison</h4>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={[
                    {
                      name: 'Revenue (k)',
                      [compareCycles[0].label]: Math.round(compareCycles[0].stats.totalRevenue / 1000),
                      [compareCycles[1].label]: Math.round(compareCycles[1].stats.totalRevenue / 1000),
                    },
                    {
                      name: 'Leads',
                      [compareCycles[0].label]: compareCycles[0].stats.totalLeads,
                      [compareCycles[1].label]: compareCycles[1].stats.totalLeads,
                    },
                    {
                      name: 'Attendance %',
                      [compareCycles[0].label]: compareCycles[0].stats.attendancePct,
                      [compareCycles[1].label]: compareCycles[1].stats.attendancePct,
                    },
                  ]}
                  layout="vertical"
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border-default))" />
                  <XAxis type="number" stroke="rgb(var(--text-secondary))" tick={{ fontSize: 11 }} />
                  <YAxis
                    dataKey="name"
                    type="category"
                    stroke="rgb(var(--text-secondary))"
                    tick={{ fontSize: 11 }}
                    width={100}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'rgb(var(--bg-card))',
                      border: 'none',
                      borderRadius: '8px',
                      color: 'rgb(var(--text-primary))',
                      fontSize: '12px',
                    }}
                  />
                  <Legend />
                  <Bar dataKey={compareCycles[0].label} fill="#3b82f6" radius={[0, 4, 4, 0]} name={compareCycles[0].label} />
                  <Bar dataKey={compareCycles[1].label} fill="#8b5cf6" radius={[0, 4, 4, 0]} name={compareCycles[1].label} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Cycles Table */}
      <div className="table-container rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="table-header sticky top-0 z-10">
              <tr>
                {hasRole('admin') && (
                  <th className="px-3 py-3 w-12 text-left">
                    <span className="text-xs text-secondary">Compare</span>
                  </th>
                )}
                <th className="text-left px-4 py-3 text-xs font-semibold text-secondary uppercase">Cycle Label</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-secondary uppercase">Period</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-secondary uppercase">Status</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-secondary uppercase">Revenue</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-secondary uppercase">Leads</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-secondary uppercase">Attendance</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-secondary uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredCycles.map((cycle) => (
                <tr
                  key={cycle.id}
                  className={cn(
                    'table-row transition-colors',
                    cycle.is_current && 'bg-blue-600/5',
                    compareSelection.includes(cycle.id) && 'bg-purple-600/10'
                  )}
                >
                  {hasRole('admin') && (
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={compareSelection.includes(cycle.id)}
                        onChange={() => toggleCompareSelection(cycle.id)}
                        className="w-4 h-4 rounded"
                      />
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-primary">{cycle.label}</span>
                      {cycle.is_current && (
                        <span className="px-2 py-0.5 bg-blue-600/20 text-blue-400 text-[10px] font-semibold rounded-full">
                          CURRENT
                        </span>
                      )}
                      {cycle.is_locked && (
                        <Lock className="w-3.5 h-3.5 text-secondary" />
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-secondary">
                    {format(new Date(cycle.cycle_start), 'dd MMM yyyy')} - {format(new Date(cycle.cycle_end), 'dd MMM yyyy')}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      'px-2.5 py-1 text-xs font-medium rounded-full',
                      cycle.status === 'current' ? 'bg-emerald-600/20 text-emerald-400' :
                      cycle.status === 'future' ? 'bg-amber-600/20 text-amber-400' :
                      'bg-[rgb(var(--bg-elevated))] text-secondary'
                    )}>
                      {cycle.status.charAt(0).toUpperCase() + cycle.status.slice(1)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm font-semibold text-emerald-400">
                      {formatINR(cycle.stats.totalRevenue)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm font-semibold text-blue-400">
                      {cycle.stats.totalLeads}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm font-semibold text-cyan-400">
                      {cycle.stats.attendancePct}%
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      {hasRole('admin') && (
                        <>
                          <button
                            onClick={() => handleToggleLock(cycle)}
                            className="p-1.5 text-secondary hover:text-primary transition-colors rounded-lg hover:bg-[rgb(var(--bg-elevated))]"
                            title={cycle.is_locked ? 'Unlock' : 'Lock'}
                          >
                            {cycle.is_locked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                          </button>
                          {!cycle.is_current && (
                            <>
                              <button
                                onClick={() => handleSetCurrent(cycle.id)}
                                className="p-1.5 text-secondary hover:text-emerald-400 transition-colors rounded-lg hover:bg-[rgb(var(--bg-elevated))]"
                                title="Set as Current"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleArchive(cycle)}
                                className="p-1.5 text-secondary hover:text-amber-400 transition-colors rounded-lg hover:bg-[rgb(var(--bg-elevated))]"
                                title="Archive"
                              >
                                <Archive className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredCycles.length === 0 && (
                <tr className="table-row">
                  <td colSpan={8} className="px-4 py-12 text-center text-secondary text-sm">
                    No billing cycles found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cycle Cards (alternative view for smaller screens) */}
      <div className="lg:hidden space-y-4">
        {filteredCycles.map((cycle) => (
          <div
            key={cycle.id}
            className={cn(
              'card rounded-2xl p-5 transition-all',
              cycle.is_current ? 'ring-1 ring-blue-600/30' :
              cycle.is_locked ? '' : ''
            )}
            style={{
              borderWidth: cycle.is_current ? '1px' : undefined,
              borderColor: cycle.is_current ? 'rgb(59, 130, 246)' :
                           cycle.is_locked ? 'rgb(var(--border-default))' : 'rgb(var(--border-default))'
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-primary">{cycle.label}</h3>
                {cycle.is_current && (
                  <span className="px-2 py-0.5 bg-blue-600/10 text-blue-400 text-[10px] font-semibold rounded-full">
                    CURRENT
                  </span>
                )}
                {cycle.is_locked && <Lock className="w-3.5 h-3.5 text-secondary" />}
              </div>
              <span className={cn(
                'px-2 py-0.5 text-[10px] font-semibold rounded-full',
                cycle.status === 'current' ? 'bg-emerald-600/20 text-emerald-400' :
                cycle.status === 'future' ? 'bg-amber-600/20 text-amber-400' :
                'bg-[rgb(var(--bg-elevated))] text-secondary'
              )}>
                {cycle.status.toUpperCase()}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="flex items-center gap-2 p-2 card rounded-lg" style={{ background: 'rgba(var(--bg-card), 0.5)' }}>
                <IndianRupee className="w-4 h-4 text-emerald-400" />
                <div>
                  <p className="text-[10px] text-secondary">Revenue</p>
                  <p className="text-sm font-semibold text-emerald-400">{formatINR(cycle.stats.totalRevenue)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 p-2 card rounded-lg" style={{ background: 'rgba(var(--bg-card), 0.5)' }}>
                <Users className="w-4 h-4 text-blue-400" />
                <div>
                  <p className="text-[10px] text-secondary">Leads</p>
                  <p className="text-sm font-semibold text-blue-400">{cycle.stats.totalLeads}</p>
                </div>
              </div>
            </div>

            <div className="space-y-1.5 text-xs mb-3">
              <div className="flex justify-between">
                <span className="text-secondary">Period</span>
                <span className="text-primary">
                  {format(new Date(cycle.cycle_start), 'dd MMM')} - {format(new Date(cycle.cycle_end), 'dd MMM yyyy')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-secondary">Attendance</span>
                <span className="text-cyan-400 font-medium">{cycle.stats.attendancePct}%</span>
              </div>
            </div>

            {hasRole('admin') && (
              <div className="flex items-center gap-2 pt-3 border-t border-[rgb(var(--border-default))]">
                <button
                  onClick={() => handleToggleLock(cycle)}
                  className="btn-secondary flex-1 py-2 text-xs flex items-center justify-center gap-1"
                >
                  {cycle.is_locked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                  {cycle.is_locked ? 'Unlock' : 'Lock'}
                </button>
                {!cycle.is_current && (
                  <>
                    <button
                      onClick={() => handleSetCurrent(cycle.id)}
                      className="flex-1 py-2 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-400 text-xs rounded-lg transition-colors flex items-center justify-center gap-1"
                    >
                      <Check className="w-3.5 h-3.5" /> Set Current
                    </button>
                    <button
                      onClick={() => handleArchive(cycle)}
                      className="flex-1 py-2 bg-amber-600/10 hover:bg-amber-600/20 text-amber-400 text-xs rounded-lg transition-colors flex items-center justify-center gap-1"
                    >
                      <Archive className="w-3.5 h-3.5" /> Archive
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Comparison Metric Component
function ComparisonMetric({
  label,
  value1,
  value2,
  format: fmt,
  cycle1Label,
  cycle2Label,
}: {
  label: string;
  value1: number;
  value2: number;
  format: 'currency' | 'number' | 'percentage';
  cycle1Label: string;
  cycle2Label: string;
}) {
  const diff = value1 - value2;
  const pctDiff = value2 !== 0 ? ((value1 - value2) / value2) * 100 : (value1 > 0 ? 100 : 0);
  const isPositive = diff > 0;
  const isNeutral = diff === 0;

  const formatValue = (v: number) => {
    if (fmt === 'currency') return formatINR(v);
    if (fmt === 'percentage') return `${v}%`;
    return v.toLocaleString();
  };

  return (
    <div className="card rounded-xl p-4" style={{ background: 'rgba(var(--bg-card), 0.5)' }}>
      <p className="text-[10px] text-secondary uppercase tracking-wider mb-2">{label}</p>
      <div className="flex items-end gap-3 mb-2">
        <span className="text-lg font-bold text-blue-400">{formatValue(value1)}</span>
        <span className="text-secondary">vs</span>
        <span className="text-lg font-bold text-purple-400">{formatValue(value2)}</span>
      </div>
      <div className="flex items-center gap-1">
        {isNeutral ? (
          <Minus className="w-3 h-3 text-secondary" />
        ) : isPositive ? (
          <TrendingUp className="w-3 h-3 text-emerald-400" />
        ) : (
          <TrendingDown className="w-3 h-3 text-red-400" />
        )}
        <span className={cn(
          'text-xs font-medium',
          isNeutral ? 'text-secondary' : isPositive ? 'text-emerald-400' : 'text-red-400'
        )}>
          {isNeutral ? 'No change' : `${isPositive ? '+' : ''}${formatValue(Math.abs(diff))} (${pctDiff.toFixed(1)}%)`}
        </span>
      </div>
      <div className="text-[10px] text-secondary mt-1">
        {cycle1Label.substring(0, 10)} vs {cycle2Label.substring(0, 10)}
      </div>
    </div>
  );
}
