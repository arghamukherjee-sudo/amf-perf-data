import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore, hasRole } from '../stores/authStore';
import type { Profile } from '../types';
import { getBillingCycle, getBillingCycleLabel, cn } from '../lib/utils';
import { format, startOfWeek, endOfWeek, subDays, subWeeks, subMonths } from 'date-fns';
import {
  Plus, Trash2, ChevronLeft, ChevronRight, Search, Download, Upload, X, Phone, Clock,
  Award, Activity, Save, Grid3x3,
} from 'lucide-react';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  LineChart, Line, BarChart, Bar, AreaChart, Area,
} from 'recharts';
import toast from 'react-hot-toast';
import Spinner from '../components/ui/Spinner';
import * as XLSX from 'xlsx';

interface KpiRow {
  id: string;
  user_id: string;
  member_name: string;
  date: string;
  call_attempts: number;
  talk_time: number;
  billing_cycle: string;
  notes: string;
}

export default function KpiPage() {
  const { profile } = useAuthStore();
  const [entries, setEntries] = useState<KpiRow[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [cycleOffset, setCycleOffset] = useState(0);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showAdd, setShowAdd] = useState(false);
  const [showMatrix, setShowMatrix] = useState(false);
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [trendFilter, setTrendFilter] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [matrixData, setMatrixData] = useState<any>({});
  const [matrixSaving, setMatrixSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const cycleDate = new Date();
  cycleDate.setMonth(cycleDate.getMonth() + cycleOffset);
  const cycle = getBillingCycle(cycleDate);
  const cycleLabel = getBillingCycleLabel(cycleDate);

  const generateDates = () => {
    const start = new Date(cycle.start);
    const end = new Date(cycle.end);
    const dates: string[] = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      dates.push(d.toISOString().split('T')[0]);
    }
    return dates;
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const cs = cycle.start.toISOString().split('T')[0];
      const ce = cycle.end.toISOString().split('T')[0];

      let query = supabase.from('daily_kpi').select('*, profile:profiles(full_name, email)')
        .gte('date', cs).lte('date', ce).order('date', { ascending: false });
      if (profile?.role === 'team_member') query = query.eq('user_id', profile.id);

      const [entriesRes, profilesRes] = await Promise.all([
        query,
        hasRole('admin') ? supabase.from('profiles').select('*').eq('is_active', true) : Promise.resolve({ data: profile ? [profile] : [] }),
      ]);

      setProfiles((profilesRes.data as Profile[]) || []);
      const data = (entriesRes.data || []).map((e: any) => ({
        id: e.id,
        user_id: e.user_id,
        member_name: (e.profile as any)?.full_name || (e.profile as any)?.email || 'Unknown',
        date: e.date,
        call_attempts: e.call_attempts || 0,
        talk_time: e.talk_time || 0,
        billing_cycle: `${e.billing_cycle_start || cs} - ${e.billing_cycle_end || ce}`,
        notes: e.notes || '',
      }));
      setEntries(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [cycleOffset, profile]);

  useEffect(() => { loadData(); }, [loadData]);

  const loadMatrixData = useCallback(async () => {
    const cs = cycle.start.toISOString().split('T')[0];
    const ce = cycle.end.toISOString().split('T')[0];
    
    const { data: members } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .eq('is_active', true);
    
    const { data: existingEntries } = await supabase
      .from('daily_kpi')
      .select('user_id, date, call_attempts, talk_time')
      .gte('date', cs)
      .lte('date', ce);
    
    const dates = generateDates();
    const matrix: any = {};
    
    members?.forEach((member: any) => {
      matrix[member.id] = {
        user_name: member.full_name || member.email,
        user_id: member.id,
      };
      dates.forEach((date) => {
        const entry = existingEntries?.find(
          (e: any) => e.user_id === member.id && e.date === date
        );
        matrix[member.id][date] = {
          calls: entry?.call_attempts || 0,
          talkTime: entry?.talk_time || 0,
        };
      });
    });
    
    setMatrixData(matrix);
  }, [cycleOffset]);

  const handleOpenMatrix = () => {
    loadMatrixData();
    setShowMatrix(true);
  };

  const updateMatrixCell = (userId: string, date: string, field: 'calls' | 'talkTime', value: number) => {
    setMatrixData((prev: any) => ({
      ...prev,
      [userId]: {
        ...prev[userId],
        [date]: {
          ...prev[userId]?.[date],
          [field]: value,
        },
      },
    }));
  };

  const saveMatrixData = async () => {
    setMatrixSaving(true);
    try {
      const cs = cycle.start.toISOString().split('T')[0];
      const ce = cycle.end.toISOString().split('T')[0];
      const records: any[] = [];
      
      for (const [userId, userData] of Object.entries(matrixData)) {
        if (userId === 'user_name' || userId === 'user_id') continue;
        const dates = generateDates();
        for (const date of dates) {
          const cellData = (userData as any)[date];
          if (cellData && (cellData.calls > 0 || cellData.talkTime > 0)) {
            records.push({
              user_id: userId,
              date: date,
              call_attempts: cellData.calls,
              talk_time: cellData.talkTime,
              billing_cycle_start: cs,
              billing_cycle_end: ce,
            });
          }
        }
      }
      
      if (records.length > 0) {
        const { error } = await supabase.from('daily_kpi').upsert(records, { 
          onConflict: 'user_id,date' 
        });
        if (error) throw error;
      }
      
      toast.success(`Saved ${records.length} records`);
      await loadData();
      setShowMatrix(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to save');
    } finally {
      setMatrixSaving(false);
    }
  };

  const filtered = entries.filter((e) =>
    e.member_name.toLowerCase().includes(search.toLowerCase()) || e.date.includes(search)
  );

  const totalCalls = entries.reduce((s, e) => s + e.call_attempts, 0);
  const totalTalkTime = entries.reduce((s, e) => s + e.talk_time, 0);
  const avgTalkTime = entries.length > 0 ? totalTalkTime / entries.length : 0;

  const memberAgg = new Map<string, { name: string; calls: number; time: number }>();
  entries.forEach((e) => {
    if (!memberAgg.has(e.user_id)) memberAgg.set(e.user_id, { name: e.member_name, calls: 0, time: 0 });
    const agg = memberAgg.get(e.user_id)!;
    agg.calls += e.call_attempts;
    agg.time += e.talk_time;
  });
  const topPerformer = Array.from(memberAgg.entries()).sort((a, b) => b[1].calls - a[1].calls)[0];

  const getTrendData = () => {
    if (trendFilter === 'daily') {
      const last7 = Array.from({ length: 7 }, (_, i) => subDays(new Date(), 6 - i));
      return last7.map((d) => {
        const ds = format(d, 'yyyy-MM-dd');
        const dayEntries = entries.filter((e) => e.date === ds);
        return {
          label: format(d, 'EEE'),
          calls: dayEntries.reduce((s, e) => s + e.call_attempts, 0),
          talkTime: Math.round(dayEntries.reduce((s, e) => s + e.talk_time, 0) / 60),
        };
      });
    } else if (trendFilter === 'weekly') {
      const last4 = Array.from({ length: 4 }, (_, i) => {
        const w = subWeeks(new Date(), 3 - i);
        return { start: startOfWeek(w, { weekStartsOn: 1 }), end: endOfWeek(w, { weekStartsOn: 1 }) };
      });
      return last4.map((w, i) => {
        const weekEntries = entries.filter((e) => {
          const d = new Date(e.date);
          return d >= w.start && d <= w.end;
        });
        return {
          label: `Week ${i + 1}`,
          calls: weekEntries.reduce((s, e) => s + e.call_attempts, 0),
          talkTime: Math.round(weekEntries.reduce((s, e) => s + e.talk_time, 0) / 60),
        };
      });
    } else {
      const last3 = Array.from({ length: 3 }, (_, i) => subMonths(new Date(), 2 - i));
      return last3.map((m) => {
        const month = format(m, 'MMM');
        const monthEntries = entries.filter((e) => {
          const d = new Date(e.date);
          return d.getMonth() === m.getMonth() && d.getFullYear() === m.getFullYear();
        });
        return {
          label: month,
          calls: monthEntries.reduce((s, e) => s + e.call_attempts, 0),
          talkTime: Math.round(monthEntries.reduce((s, e) => s + e.talk_time, 0) / 60),
        };
      });
    }
  };
  const trendData = getTrendData();

  const memberData = Array.from(memberAgg.entries())
    .sort((a, b) => b[1].calls - a[1].calls)
    .slice(0, 8)
    .map(([id, agg]) => ({
      name: agg.name.length > 10 ? agg.name.substring(0, 10) + '..' : agg.name,
      calls: agg.calls,
      talkTime: Math.round(agg.time / 60),
    }));

  const handleAdd = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const userId = (form.elements.namedItem('user_id') as HTMLSelectElement)?.value || profile?.id;
    const date = (form.elements.namedItem('date') as HTMLInputElement).value;
    const callAttempts = parseInt((form.elements.namedItem('call_attempts') as HTMLInputElement).value) || 0;
    const talkTime = parseInt((form.elements.namedItem('talk_time') as HTMLInputElement).value) || 0;
    const notes = (form.elements.namedItem('notes') as HTMLInputElement).value || '';

    if (!date) { toast.error('Date required'); return; }

    try {
      const { error } = await supabase.from('daily_kpi').upsert({
        user_id: userId,
        date,
        call_attempts: callAttempts,
        talk_time: talkTime,
        notes,
      }, { onConflict: 'user_id,date' });
      if (error) throw error;
      toast.success('KPI entry added');
      setShowAdd(false);
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Failed');
    }
  };

  const handleCellSave = async (id: string, field: string) => {
    try {
      const val = field === 'notes' ? editValue : parseInt(editValue) || 0;
      const { error } = await supabase.from('daily_kpi').update({ [field]: val }).eq('id', id);
      if (error) throw error;
      toast.success('Updated');
      setEditingCell(null);
      loadData();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} entries?`)) return;
    try {
      await supabase.from('daily_kpi').delete().in('id', Array.from(selected));
      toast.success('Deleted');
      setSelected(new Set());
      loadData();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleExport = (fmt: 'csv' | 'xlsx') => {
    const rows = filtered.map((e) => ({
      'Team Member': e.member_name,
      'Date': e.date,
      'Call Attempts': e.call_attempts,
      'Talk Time (min)': Math.round(e.talk_time / 60),
      'Billing Cycle': e.billing_cycle,
      'Notes': e.notes,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'KPI');
    if (fmt === 'csv') {
      const csv = XLSX.utils.sheet_to_csv(ws);
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'kpi.csv'; a.click();
      URL.revokeObjectURL(url);
    } else {
      XLSX.writeFile(wb, 'kpi.xlsx');
    }
    toast.success(`Exported as ${fmt.toUpperCase()}`);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]) as any[];
      const profileLookup = new Map(profiles.map((p) => [p.full_name?.toLowerCase(), p.id]));

      const toInsert = rows.map((row) => {
        const name = (row['Team Member'] || '').toLowerCase();
        return {
          user_id: profileLookup.get(name) || profile?.id,
          date: String(row['Date'] || '').split('T')[0],
          call_attempts: parseInt(row['Call Attempts']) || 0,
          talk_time: (parseInt(row['Talk Time (min)']) || 0) * 60,
          notes: String(row['Notes'] || ''),
        };
      }).filter((r) => r.user_id && r.date);

      if (toInsert.length === 0) { toast.error('No valid rows'); return; }
      const { error } = await supabase.from('daily_kpi').upsert(toInsert, { onConflict: 'user_id,date' });
      if (error) throw error;
      toast.success(`${toInsert.length} imported`);
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Import failed');
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((e) => e.id)));
  };

  const formatDuration = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
  };

  const dates = generateDates();

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><Spinner size="lg" /></div>;

  const tooltipStyle = { background: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '12px' };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary">KPI Monitoring</h1>
          <p className="text-secondary text-sm mt-1">{cycleLabel}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setCycleOffset((p) => p - 1)} className="btn-secondary p-2"><ChevronLeft className="w-4 h-4" /></button>
          <button onClick={() => setCycleOffset(0)} className="btn-primary">Current</button>
          <button onClick={() => setCycleOffset((p) => p + 1)} className="btn-secondary p-2"><ChevronRight className="w-4 h-4" /></button>
          <div className="w-px h-6 bg-[rgb(var(--border-default))]" />
          <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-1"><Plus className="w-4 h-4" />Add</button>
          <button onClick={handleOpenMatrix} className="btn-secondary flex items-center gap-1"><Grid3x3 className="w-4 h-4" />Matrix View</button>
          {selected.size > 0 && <button onClick={handleBulkDelete} className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg flex items-center gap-1"><Trash2 className="w-4 h-4" />Delete ({selected.size})</button>}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] text-secondary uppercase">Total Calls</p>
            <Phone className="w-4 h-4 text-blue-400" />
          </div>
          <p className="text-xl font-bold text-blue-400">{totalCalls}</p>
        </div>
        <div className="card rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] text-secondary uppercase">Avg Talk Time</p>
            <Clock className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-xl font-bold text-emerald-400">{formatDuration(avgTalkTime)}</p>
        </div>
        <div className="card rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] text-secondary uppercase">Total Talk Time</p>
            <Activity className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-xl font-bold text-amber-400">{formatDuration(totalTalkTime)}</p>
        </div>
        <div className="card rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] text-secondary uppercase">Top Performer</p>
            <Award className="w-4 h-4 text-rose-400" />
          </div>
          <p className="text-sm font-bold text-rose-400 truncate">{topPerformer?.[1]?.name || '-'}</p>
          <p className="text-[10px] text-secondary">{topPerformer?.[1]?.calls || 0} calls</p>
        </div>
      </div>

      {/* Trend Filters */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-secondary">Trend:</span>
        {(['daily', 'weekly', 'monthly'] as const).map((f) => (
          <button key={f} onClick={() => setTrendFilter(f)} className={cn('px-3 py-1.5 text-xs rounded-lg transition-colors', trendFilter === f ? 'btn-primary' : 'btn-secondary')}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card rounded-2xl p-6">
          <h3 className="text-sm font-semibold text-primary mb-4">Call Trends</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border-default))" />
              <XAxis dataKey="label" stroke="rgb(var(--text-secondary))" tick={{ fontSize: 10 }} />
              <YAxis stroke="rgb(var(--text-secondary))" tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend />
              <Line type="monotone" dataKey="calls" stroke="#3b82f6" name="Calls" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card rounded-2xl p-6">
          <h3 className="text-sm font-semibold text-primary mb-4">Talk Time Trends</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border-default))" />
              <XAxis dataKey="label" stroke="rgb(var(--text-secondary))" tick={{ fontSize: 10 }} />
              <YAxis stroke="rgb(var(--text-secondary))" tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area type="monotone" dataKey="talkTime" stroke="#10b981" fill="#10b981" fillOpacity={0.1} name="Minutes" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="card rounded-2xl p-6 lg:col-span-2">
          <h3 className="text-sm font-semibold text-primary mb-4">Team Member Performance</h3>
          {memberData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={memberData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border-default))" />
                <XAxis dataKey="name" stroke="rgb(var(--text-secondary))" tick={{ fontSize: 10 }} />
                <YAxis stroke="rgb(var(--text-secondary))" tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend />
                <Bar dataKey="calls" fill="#3b82f6" name="Calls" radius={[4, 4, 0, 0]} />
                <Bar dataKey="talkTime" fill="#10b981" name="Talk Time (min)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-secondary text-sm">No data</div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3">
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search member or date..."
          className="input flex-1 min-w-[200px] max-w-md px-4 py-2.5 rounded-xl text-sm" />
        <button onClick={() => handleExport('csv')} className="btn-secondary text-xs flex items-center gap-1"><Download className="w-3.5 h-3.5" />CSV</button>
        <button onClick={() => handleExport('xlsx')} className="btn-secondary text-xs flex items-center gap-1"><Download className="w-3.5 h-3.5" />XLSX</button>
        <button onClick={() => fileInputRef.current?.click()} className="btn-secondary text-xs flex items-center gap-1"><Upload className="w-3.5 h-3.5" />Import</button>
        <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleImport} className="hidden" />
      </div>

      {/* Data Table */}
      <div className="table-container rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="table-header sticky top-0 z-10">
              <tr>
                <th className="px-3 py-3 w-10"><input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={toggleSelectAll} className="w-4 h-4 rounded" /></th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-secondary uppercase">Team Member</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-secondary uppercase">Date</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-secondary uppercase">Call Attempts</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-secondary uppercase">Talk Time</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-secondary uppercase">Billing Cycle</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-secondary uppercase">Notes</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id} className={cn('table-row', selected.has(e.id) && 'bg-blue-600/5')}>
                  <td className="px-3 py-2"><input type="checkbox" checked={selected.has(e.id)} onChange={() => toggleSelect(e.id)} className="w-4 h-4 rounded" /></td>
                  <td className="px-4 py-2 text-sm text-primary">{e.member_name}</td>
                  <td className="px-4 py-2 text-sm text-primary">{format(new Date(e.date), 'dd MMM yyyy')}</td>
                  <td className="px-4 py-2 text-right">
                    {editingCell === `${e.id}-call_attempts` ? (
                      <input type="number" value={editValue} onChange={(ev) => setEditValue(ev.target.value)} onBlur={() => handleCellSave(e.id, 'call_attempts')} onKeyDown={(ev) => ev.key === 'Enter' && handleCellSave(e.id, 'call_attempts')} autoFocus className="input w-16 px-2 py-1 text-xs text-right" />
                    ) : (
                      <span onClick={() => { setEditingCell(`${e.id}-call_attempts`); setEditValue(String(e.call_attempts)); }} className="text-sm text-blue-400 cursor-pointer">{e.call_attempts}</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {editingCell === `${e.id}-talk_time` ? (
                      <input type="number" value={editValue} onChange={(ev) => setEditValue(ev.target.value)} onBlur={() => handleCellSave(e.id, 'talk_time')} onKeyDown={(ev) => ev.key === 'Enter' && handleCellSave(e.id, 'talk_time')} autoFocus className="input w-20 px-2 py-1 text-xs text-right" placeholder="seconds" />
                    ) : (
                      <span onClick={() => { setEditingCell(`${e.id}-talk_time`); setEditValue(String(e.talk_time)); }} className="text-sm text-emerald-400 cursor-pointer">{formatDuration(e.talk_time)}</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs text-secondary">{e.billing_cycle}</td>
                  <td className="px-4 py-2 max-w-[150px]">
                    {editingCell === `${e.id}-notes` ? (
                      <input type="text" value={editValue} onChange={(ev) => setEditValue(ev.target.value)} onBlur={() => handleCellSave(e.id, 'notes')} onKeyDown={(ev) => ev.key === 'Enter' && handleCellSave(e.id, 'notes')} autoFocus className="input px-2 py-1 text-xs w-full" />
                    ) : (
                      <span onClick={() => { setEditingCell(`${e.id}-notes`); setEditValue(e.notes); }} className="text-sm text-secondary cursor-pointer truncate block">{e.notes || '-'}</span>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-secondary text-sm">No KPI entries</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Matrix View Modal */}
      {showMatrix && (
        <div className="fixed inset-0 z-50 bg-black/60 overflow-auto p-4">
          <div className="card rounded-2xl w-full max-w-[95vw] mx-auto my-4">
            <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-card z-10">
              <div>
                <h2 className="text-lg font-bold text-primary">Matrix View - Daily KPI Entry</h2>
                <p className="text-xs text-muted">{cycleLabel}</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={saveMatrixData} disabled={matrixSaving} className="btn-primary flex items-center gap-2">
                  <Save className="w-4 h-4" />
                  {matrixSaving ? 'Saving...' : 'Save All'}
                </button>
                <button onClick={() => setShowMatrix(false)} className="btn-secondary p-2">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="overflow-x-auto p-4">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-secondary">
                    <th className="p-2 sticky left-0 bg-secondary z-10 min-w-[120px] text-left">Team Member</th>
                    {dates.map((date) => (
                      <th key={date} className="p-2 min-w-[110px]">
                        <div className="text-center">
                          <div className="font-medium">{format(new Date(date), 'dd MMM')}</div>
                          <div className="text-[10px] text-muted">{format(new Date(date), 'EEE')}</div>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(matrixData).map(([userId, userData]: [string, any]) => {
                    if (userId === 'user_name' || userId === 'user_id') return null;
                    return (
                      <tr key={userId} className="border-b border-border">
                        <td className="p-2 sticky left-0 bg-card font-medium min-w-[120px]">
                          {userData.user_name}
                        </td>
                        {dates.map((date) => {
                          const cellData = userData[date] || { calls: 0, talkTime: 0 };
                          return (
                            <td key={date} className="p-2">
                              <div className="space-y-1">
                                <input
                                  type="number"
                                  placeholder="Calls"
                                  value={cellData.calls || ''}
                                  onChange={(e) => updateMatrixCell(userId, date, 'calls', parseInt(e.target.value) || 0)}
                                  className="input w-full text-xs p-1 text-center"
                                />
                                <input
                                  type="number"
                                  placeholder="Talk Time (sec)"
                                  value={cellData.talkTime || ''}
                                  onChange={(e) => updateMatrixCell(userId, date, 'talkTime', parseInt(e.target.value) || 0)}
                                  className="input w-full text-xs p-1 text-center"
                                />
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Add Entry Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form onSubmit={handleAdd} className="card rounded-2xl p-6 w-full max-w-md space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-primary">Add KPI Entry</h2>
              <button type="button" onClick={() => setShowAdd(false)} className="text-secondary hover:text-primary"><X className="w-5 h-5" /></button>
            </div>
            {hasRole('admin') && (
              <div>
                <label className="block text-sm font-medium text-secondary mb-1">Team Member</label>
                <select name="user_id" className="input w-full px-3 py-2 text-sm">
                  {profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-secondary mb-1">Date</label>
              <input name="date" type="date" required defaultValue={new Date().toISOString().split('T')[0]} className="input w-full px-3 py-2 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-secondary mb-1">Call Attempts</label>
                <input name="call_attempts" type="number" min="0" defaultValue="0" className="input w-full px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-secondary mb-1">Talk Time (seconds)</label>
                <input name="talk_time" type="number" min="0" defaultValue="0" className="input w-full px-3 py-2 text-sm" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-secondary mb-1">Notes</label>
              <input name="notes" type="text" className="input w-full px-3 py-2 text-sm" />
            </div>
            <button type="submit" className="btn-primary w-full py-2.5 font-semibold rounded-xl text-sm">Add Entry</button>
          </form>
        </div>
      )}
    </div>
  );
}