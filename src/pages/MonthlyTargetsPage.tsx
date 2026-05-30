import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore, hasRole } from '../stores/authStore';
import type { MonthlyTarget, Profile } from '../types';
import { formatINR, formatINRShort, percentage, getBillingCycle, getBillingCycleLabel, cn } from '../lib/utils';
import {
  Plus, Trash2, ChevronLeft, ChevronRight, Search, Download, Upload, X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Spinner from '../components/ui/Spinner';
import * as XLSX from 'xlsx';

interface TargetRow {
  id: string;
  user_id: string;
  member_name: string;
  billing_cycle_start: string;
  billing_cycle_end: string;
  revenue_target: number;
  leads_target: number;
  revenue_achieved: number;
  leads_achieved: number;
  achievement_pct: number;
  remaining_pct: number;
  arpu: number;
  notes: string;
}

export default function MonthlyTargetsPage() {
  const { profile } = useAuthStore();
  const [targets, setTargets] = useState<TargetRow[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [cycleOffset, setCycleOffset] = useState(0);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showAdd, setShowAdd] = useState(false);
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const cycleDate = new Date();
  cycleDate.setMonth(cycleDate.getMonth() + cycleOffset);
  const cycle = getBillingCycle(cycleDate);
  const cycleLabel = getBillingCycleLabel(cycleDate);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const cs = cycle.start.toISOString().split('T')[0];
      const ce = cycle.end.toISOString().split('T')[0];

      // Get monthly targets
      let targetsQuery = supabase.from('monthly_targets').select('*, profile:profiles(full_name, email)')
        .gte('billing_cycle_start', cs).lte('billing_cycle_end', ce);
      if (profile?.role === 'team_member') targetsQuery = targetsQuery.eq('user_id', profile.id);

      // Get achievements from lead_assignments
      let leadsQuery = supabase.from('lead_assignments').select('user_id, revenue, leads_assigned')
        .gte('billing_cycle_start', cs).lte('billing_cycle_end', ce);
      if (profile?.role === 'team_member') leadsQuery = leadsQuery.eq('user_id', profile.id);

      const [targetsRes, leadsRes, profilesRes] = await Promise.all([
        targetsQuery,
        leadsQuery,
        hasRole('admin') ? supabase.from('profiles').select('*').eq('is_active', true) : Promise.resolve({ data: profile ? [profile] : [] }),
      ]);

      const targetData = targetsRes.data || [];
      const leadsData = leadsRes.data || [];
      setProfiles((profilesRes.data as Profile[]) || []);

      // Aggregate achievements by user
      const achievementMap = new Map<string, { revenue: number; leads: number }>();
      leadsData.forEach((l: any) => {
        if (!achievementMap.has(l.user_id)) achievementMap.set(l.user_id, { revenue: 0, leads: 0 });
        const agg = achievementMap.get(l.user_id)!;
        agg.revenue += Number(l.revenue) || 0;
        agg.leads += Number(l.leads_assigned) || 0;
      });

      // Merge targets with achievements
      const rows: TargetRow[] = targetData.map((t: any) => {
        const achieve = achievementMap.get(t.user_id) || { revenue: 0, leads: 0 };
        const revenueTarget = Number(t.target_value) || 0;
        const leadsTarget = 0; // Would need separate target column
        const achievementPct = revenueTarget > 0 ? percentage(achieve.revenue, revenueTarget) : 0;
        const remainingPct = Math.max(0, 100 - achievementPct);
        const arpu = achieve.leads > 0 ? achieve.revenue / achieve.leads : 0;

        return {
          id: t.id,
          user_id: t.user_id,
          member_name: (t.profile as any)?.full_name || (t.profile as any)?.email || 'Unknown',
          billing_cycle_start: t.billing_cycle_start,
          billing_cycle_end: t.billing_cycle_end,
          revenue_target: revenueTarget,
          leads_target: t.leads_target || 0,
          revenue_achieved: achieve.revenue,
          leads_achieved: achieve.leads,
          achievement_pct: achievementPct,
          remaining_pct: remainingPct,
          arpu,
          notes: t.notes || '',
        };
      });

      setTargets(rows);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [cycleOffset, profile]);

  useEffect(() => { loadData(); }, [loadData]);

  const filtered = targets.filter((t) =>
    t.member_name.toLowerCase().includes(search.toLowerCase())
  );

  const handleAdd = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const userId = (form.elements.namedItem('user_id') as HTMLSelectElement).value;
    const revenueTarget = parseFloat((form.elements.namedItem('revenue_target') as HTMLInputElement).value) || 0;
    const leadsTarget = parseInt((form.elements.namedItem('leads_target') as HTMLInputElement).value) || 0;
    const notes = (form.elements.namedItem('notes') as HTMLInputElement).value;

    try {
      const { error } = await supabase.from('monthly_targets').upsert({
        user_id: userId || profile?.id,
        billing_cycle_start: cycle.start.toISOString().split('T')[0],
        billing_cycle_end: cycle.end.toISOString().split('T')[0],
        category: 'revenue',
        metric_name: 'Revenue Target',
        target_value: revenueTarget,
        achieved_value: 0,
        notes,
      }, { onConflict: 'user_id,billing_cycle_start,billing_cycle_end,category' });
      if (error) throw error;
      toast.success('Target set');
      setShowAdd(false);
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Failed');
    }
  };

  const handleCellSave = async (id: string, field: string) => {
    try {
      const val = field === 'notes' ? editValue : parseFloat(editValue) || 0;
      const updates = field === 'notes' ? { notes: val } : { target_value: val };
      const { error } = await supabase.from('monthly_targets').update(updates).eq('id', id);
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
    if (!confirm(`Delete ${selected.size} targets?`)) return;
    try {
      await supabase.from('monthly_targets').delete().in('id', Array.from(selected));
      toast.success('Deleted');
      setSelected(new Set());
      loadData();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((t) => t.id)));
  };

  const handleExport = (fmt: 'csv' | 'xlsx') => {
    const rows = filtered.map((t) => ({
      'Team Member': t.member_name,
      'Billing Cycle': `${t.billing_cycle_start} - ${t.billing_cycle_end}`,
      'Revenue Target': t.revenue_target,
      'Leads Target': t.leads_target,
      'Revenue Achieved': t.revenue_achieved,
      'Leads Achieved': t.leads_achieved,
      'Achievement %': t.achievement_pct,
      'Remaining %': t.remaining_pct,
      'ARPU': Math.round(t.arpu),
      'Notes': t.notes,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Monthly Targets');
    if (fmt === 'csv') {
      const csv = XLSX.utils.sheet_to_csv(ws);
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'monthly_targets.csv'; a.click();
      URL.revokeObjectURL(url);
    } else {
      XLSX.writeFile(wb, 'monthly_targets.xlsx');
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

      const toInsert = rows.map((row) => ({
        user_id: profileLookup.get((row['Team Member'] || '').toLowerCase()) || profile?.id,
        billing_cycle_start: cycle.start.toISOString().split('T')[0],
        billing_cycle_end: cycle.end.toISOString().split('T')[0],
        category: 'revenue',
        metric_name: 'Revenue Target',
        target_value: parseFloat(row['Revenue Target']) || 0,
        achieved_value: 0,
        notes: String(row['Notes'] || ''),
      })).filter((r) => r.user_id);

      if (toInsert.length === 0) { toast.error('No valid rows'); return; }
      const { error } = await supabase.from('monthly_targets').upsert(toInsert, { onConflict: 'user_id,billing_cycle_start,billing_cycle_end,category' });
      if (error) throw error;
      toast.success(`${toInsert.length} imported`);
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Import failed');
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><Spinner size="lg" /></div>;

  const totalTarget = targets.reduce((s, t) => s + t.revenue_target, 0);
  const totalAchieved = targets.reduce((s, t) => s + t.revenue_achieved, 0);
  const avgAchievement = targets.length > 0 ? targets.reduce((s, t) => s + t.achievement_pct, 0) / targets.length : 0;
  const avgArpu = targets.length > 0 ? targets.reduce((s, t) => s + t.arpu, 0) / targets.length : 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-primary">Monthly Targets</h1>
          <p className="text-secondary text-xs mt-0.5">{cycleLabel}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setCycleOffset((p) => p - 1)} className="btn-secondary p-1.5"><ChevronLeft className="w-4 h-4" /></button>
          <button onClick={() => setCycleOffset(0)} className="btn-primary px-2.5 py-1.5 text-xs">Current</button>
          <button onClick={() => setCycleOffset((p) => p + 1)} className="btn-secondary p-1.5"><ChevronRight className="w-4 h-4" /></button>
          <div className="w-px h-5 mx-1" style={{ background: 'rgb(var(--border-default))' }} />
          <button onClick={() => setShowAdd(true)} className="btn-primary px-2.5 py-1.5 text-xs flex items-center gap-1"><Plus className="w-3.5 h-3.5" />Add</button>
          {selected.size > 0 && <button onClick={handleBulkDelete} className="px-2.5 py-1.5 text-xs rounded-lg flex items-center gap-1" style={{ background: 'rgb(var(--error) / 0.2)', color: 'rgb(var(--error))' }}><Trash2 className="w-3.5 h-3.5" />Delete ({selected.size})</button>}
        </div>
      </div>

      {/* Summary Stats Row */}
      <div className="grid grid-cols-4 gap-3">
        <div className="card p-3">
          <p className="text-[10px] text-muted uppercase tracking-wider">Total Target</p>
          <p className="text-lg font-bold text-primary">{formatINRShort(totalTarget)}</p>
        </div>
        <div className="card p-3">
          <p className="text-[10px] text-muted uppercase tracking-wider">Total Achieved</p>
          <p className="text-lg font-bold" style={{ color: 'rgb(var(--success))' }}>{formatINRShort(totalAchieved)}</p>
        </div>
        <div className="card p-3">
          <p className="text-[10px] text-muted uppercase tracking-wider">Avg Achievement</p>
          <p className={cn('text-lg font-bold', avgAchievement >= 100 ? 'text-success' : avgAchievement >= 75 ? 'text-warning' : 'text-error')}>{avgAchievement.toFixed(1)}%</p>
        </div>
        <div className="card p-3">
          <p className="text-[10px] text-muted uppercase tracking-wider">Avg ARPU</p>
          <p className="text-lg font-bold" style={{ color: 'rgb(var(--info))' }}>{formatINRShort(avgArpu)}</p>
        </div>
      </div>

      {/* Search and Export */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search member..." className="input pl-9 text-xs py-2" />
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => handleExport('csv')} className="btn-ghost px-2 py-1.5 text-xs rounded-lg flex items-center gap-1"><Download className="w-3 h-3" />CSV</button>
          <button onClick={() => handleExport('xlsx')} className="btn-ghost px-2 py-1.5 text-xs rounded-lg flex items-center gap-1"><Download className="w-3 h-3" />XLSX</button>
          <button onClick={() => fileInputRef.current?.click()} className="btn-ghost px-2 py-1.5 text-xs rounded-lg flex items-center gap-1"><Upload className="w-3 h-3" />Import</button>
          <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleImport} className="hidden" />
        </div>
      </div>

      {/* Matrix Table */}
      <div className="table-container overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="table-header">
              <tr>
                <th className="px-3 py-2 w-8">
                  <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={toggleSelectAll} className="w-3.5 h-3.5 rounded" style={{ accentColor: 'rgb(var(--text-primary))' }} />
                </th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-secondary uppercase tracking-wider">Member</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-secondary uppercase tracking-wider">Revenue Target</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-secondary uppercase tracking-wider">Leads Target</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-secondary uppercase tracking-wider">Achieved</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-secondary uppercase tracking-wider">Progress</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-secondary uppercase tracking-wider">Remaining</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-secondary uppercase tracking-wider">ARPU</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-secondary uppercase tracking-wider min-w-[120px]">Notes</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id} className={cn('table-row table-row-zebra', selected.has(t.id) && 'bg-hover')}>
                  <td className="px-3 py-2"><input type="checkbox" checked={selected.has(t.id)} onChange={() => toggleSelect(t.id)} className="w-3.5 h-3.5 rounded" style={{ accentColor: 'rgb(var(--text-primary))' }} /></td>
                  <td className="px-3 py-2 text-primary font-medium truncate max-w-[140px]">{t.member_name}</td>
                  <td className="px-3 py-2 text-right">
                    {editingCell === `${t.id}-revenue_target` ? (
                      <input type="number" value={editValue} onChange={(e) => setEditValue(e.target.value)} onBlur={() => handleCellSave(t.id, 'revenue_target')} onKeyDown={(e) => e.key === 'Enter' && handleCellSave(t.id, 'revenue_target')} autoFocus className="input py-1 text-xs w-24 text-right" />
                    ) : (
                      <span onClick={() => { setEditingCell(`${t.id}-revenue_target`); setEditValue(String(t.revenue_target)); }} className="text-secondary cursor-pointer hover:text-primary px-1 py-0.5 rounded hover:bg-hover">{formatINRShort(t.revenue_target)}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-secondary">{t.leads_target}</td>
                  <td className="px-3 py-2 text-right font-semibold" style={{ color: 'rgb(var(--success))' }}>{formatINRShort(t.revenue_achieved)}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 h-2 rounded-full" style={{ background: 'rgb(var(--border-default))' }}>
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${Math.min(t.achievement_pct, 100)}%`,
                            background: t.achievement_pct >= 100 ? 'rgb(var(--success))' : t.achievement_pct >= 75 ? 'rgb(var(--warning))' : 'rgb(var(--error))'
                          }}
                        />
                      </div>
                      <span className={cn('text-xs font-semibold', t.achievement_pct >= 100 ? 'text-success' : t.achievement_pct >= 75 ? 'text-warning' : 'text-error')}>
                        {t.achievement_pct}%
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right text-muted">{t.remaining_pct}%</td>
                  <td className="px-3 py-2 text-right" style={{ color: 'rgb(var(--info))' }}>{formatINRShort(Math.round(t.arpu))}</td>
                  <td className="px-3 py-2">
                    {editingCell === `${t.id}-notes` ? (
                      <input type="text" value={editValue} onChange={(e) => setEditValue(e.target.value)} onBlur={() => handleCellSave(t.id, 'notes')} onKeyDown={(e) => e.key === 'Enter' && handleCellSave(t.id, 'notes')} autoFocus className="input py-1 text-xs w-full" />
                    ) : (
                      <span onClick={() => { setEditingCell(`${t.id}-notes`); setEditValue(t.notes); }} className="text-muted cursor-pointer hover:text-primary px-1 py-0.5 rounded hover:bg-hover truncate block max-w-[100px]">{t.notes || '-'}</span>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-muted text-sm">No targets set for this cycle</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Modal */}
      {showAdd && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowAdd(false)}>
          <form onSubmit={handleAdd} className="modal-content space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-primary">Set Target</h2>
              <button type="button" onClick={() => setShowAdd(false)} className="text-secondary hover:text-primary"><X className="w-5 h-5" /></button>
            </div>
            {hasRole('admin') && (
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">Team Member</label>
                <select name="user_id" required className="input">
                  <option value="">Select member</option>
                  {profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
                </select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">Revenue Target</label>
                <input name="revenue_target" type="number" min="0" required className="input" defaultValue="0" />
              </div>
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">Leads Target</label>
                <input name="leads_target" type="number" min="0" className="input" defaultValue="0" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-secondary mb-1">Notes</label>
              <input name="notes" type="text" className="input" placeholder="Optional" />
            </div>
            <button type="submit" className="btn-primary w-full py-2 text-sm">Save Target</button>
          </form>
        </div>
      )}
    </div>
  );
}
