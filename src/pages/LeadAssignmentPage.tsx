import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore, hasRole } from '../stores/authStore';
import type { LeadAssignment, Profile } from '../types';
import { formatINR, formatINRShort, percentage, getBillingCycle, getBillingCycleLabel, cn } from '../lib/utils';
import { format } from 'date-fns';
import { Plus, Trash2, ChevronLeft, ChevronRight, Search, Download, Upload, X, IndianRupee } from 'lucide-react';
import toast from 'react-hot-toast';
import Spinner from '../components/ui/Spinner';
import * as XLSX from 'xlsx';

export default function LeadAssignmentPage() {
  const { profile } = useAuthStore();
  const [entries, setEntries] = useState<LeadAssignment[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [cycleOffset, setCycleOffset] = useState(0);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showAdd, setShowAdd] = useState(false);
  const [showBulkAdd, setShowBulkAdd] = useState(false);
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
      let query = supabase
        .from('lead_assignments')
        .select('*, profile:profiles(full_name, email), team:teams(name)')
        .gte('billing_cycle_start', cs)
        .lte('billing_cycle_end', ce);
      if (profile?.role === 'team_member') query = query.eq('user_id', profile.id);

      const [entriesRes, profilesRes] = await Promise.all([
        query.order('assigned_date', { ascending: false }),
        hasRole('admin') ? supabase.from('profiles').select('*').eq('is_active', true) : Promise.resolve({ data: profile ? [profile] : [] }),
      ]);

      setEntries((entriesRes.data as LeadAssignment[]) || []);
      setProfiles((profilesRes.data as Profile[]) || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [cycleOffset, profile]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleCellSave = async (id: string, field: string) => {
    try {
      const val = (field === 'notes' || field === 'batch_name') ? editValue : parseFloat(editValue) || 0;
      const { error } = await supabase.from('lead_assignments').update({ [field]: val }).eq('id', id);
      if (error) throw error;
      toast.success('Updated');
      setEditingCell(null);
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Update failed');
    }
  };

  const handleAdd = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const userId = (form.elements.namedItem('user_id') as HTMLSelectElement).value || profile?.id;
    const assignedDate = (form.elements.namedItem('assigned_date') as HTMLInputElement).value;
    const leadsAssigned = parseInt((form.elements.namedItem('leads_assigned') as HTMLInputElement).value) || 0;
    const revenue = parseFloat((form.elements.namedItem('revenue') as HTMLInputElement).value) || 0;
    const batchName = (form.elements.namedItem('batch_name') as HTMLInputElement).value;
    const notes = (form.elements.namedItem('notes') as HTMLInputElement).value;

    if (!assignedDate) { toast.error('Date required'); return; }

    try {
      const { error } = await supabase.from('lead_assignments').upsert({
        user_id: userId,
        assigned_date: assignedDate,
        leads_assigned: leadsAssigned,
        revenue,
        batch_name: batchName,
        billing_cycle_start: cycle.start.toISOString().split('T')[0],
        billing_cycle_end: cycle.end.toISOString().split('T')[0],
        notes,
      }, { onConflict: 'user_id,assigned_date,batch_name' });
      if (error) throw error;
      toast.success('Entry added');
      setShowAdd(false);
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Failed');
    }
  };

  const handleBulkAdd = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const assignedDate = (form.elements.namedItem('assigned_date') as HTMLInputElement).value;
    const leadsAssigned = parseInt((form.elements.namedItem('leads_assigned') as HTMLInputElement).value) || 0;
    const revenue = parseFloat((form.elements.namedItem('revenue') as HTMLInputElement).value) || 0;
    const batchName = (form.elements.namedItem('batch_name') as HTMLInputElement).value;
    const notes = (form.elements.namedItem('notes') as HTMLInputElement).value;

    if (!assignedDate) { toast.error('Date required'); return; }

    const rows = profiles.map((p) => ({
      user_id: p.id,
      assigned_date: assignedDate,
      leads_assigned: leadsAssigned,
      revenue,
      batch_name: batchName,
      billing_cycle_start: cycle.start.toISOString().split('T')[0],
      billing_cycle_end: cycle.end.toISOString().split('T')[0],
      notes,
    }));

    try {
      const { error } = await supabase.from('lead_assignments').upsert(rows, { onConflict: 'user_id,assigned_date,batch_name' });
      if (error) throw error;
      toast.success(`${rows.length} entries added`);
      setShowBulkAdd(false);
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Bulk add failed');
    }
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} entries?`)) return;
    try {
      const { error } = await supabase.from('lead_assignments').delete().in('id', Array.from(selected));
      if (error) throw error;
      toast.success(`${selected.size} entries deleted`);
      setSelected(new Set());
      loadData();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this entry?')) return;
    try {
      const { error } = await supabase.from('lead_assignments').delete().eq('id', id);
      if (error) throw error;
      toast.success('Deleted');
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
    else setSelected(new Set(filtered.map((e) => e.id)));
  };

  const handleExport = (fmt: 'csv' | 'xlsx') => {
    const rows = filtered.map((e) => ({
      'Team Member': (e.profile as any)?.full_name || '',
      'Assigned Date': e.assigned_date,
      'Leads Assigned': e.leads_assigned,
      'Revenue': Number(e.revenue),
      'Batch Name': e.batch_name,
      'Notes': e.notes || '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Lead Assignments');
    if (fmt === 'csv') {
      const csv = XLSX.utils.sheet_to_csv(ws);
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'lead_assignments.csv'; a.click();
      URL.revokeObjectURL(url);
    } else {
      XLSX.writeFile(wb, 'lead_assignments.xlsx');
    }
    toast.success(`Exported as ${fmt.toUpperCase()}`);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws) as any[];
      const profileLookup = new Map(profiles.map((p) => [p.full_name?.toLowerCase(), p.id]));
      const toInsert = rows.map((row) => {
        const name = (row['Team Member'] || '').toLowerCase();
        const userId = profileLookup.get(name) || profile?.id;
        const dateStr = String(row['Assigned Date'] || '').split('T')[0];
        return {
          user_id: userId,
          assigned_date: dateStr,
          leads_assigned: parseInt(row['Leads Assigned']) || 0,
          revenue: parseFloat(row['Revenue']) || 0,
          batch_name: String(row['Batch Name'] || ''),
          billing_cycle_start: cycle.start.toISOString().split('T')[0],
          billing_cycle_end: cycle.end.toISOString().split('T')[0],
          notes: String(row['Notes'] || ''),
        };
      }).filter((e) => e.user_id && e.assigned_date);
      if (toInsert.length === 0) { toast.error('No valid rows found'); return; }
      const { error } = await supabase.from('lead_assignments').upsert(toInsert, { onConflict: 'user_id,assigned_date,batch_name' });
      if (error) throw error;
      toast.success(`${toInsert.length} entries imported`);
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Import failed');
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><Spinner size="lg" /></div>;

  const totalRevenue = entries.reduce((s, e) => s + Number(e.revenue), 0);
  const totalLeads = entries.reduce((s, e) => s + Number(e.leads_assigned), 0);

  let filtered = entries.filter((e) =>
    ((e.profile as any)?.full_name || '').toLowerCase().includes(search.toLowerCase()) ||
    e.batch_name.toLowerCase().includes(search.toLowerCase()) ||
    e.assigned_date.includes(search)
  );

  // Per-member aggregation for the matrix
  const memberAgg = new Map<string, { name: string; leads: number; revenue: number }>();
  entries.forEach((e) => {
    const key = e.user_id;
    const name = (e.profile as any)?.full_name || (e.profile as any)?.email || '';
    if (!memberAgg.has(key)) memberAgg.set(key, { name, leads: 0, revenue: 0 });
    const agg = memberAgg.get(key)!;
    agg.leads += Number(e.leads_assigned);
    agg.revenue += Number(e.revenue);
  });

  const sortedMembers = Array.from(memberAgg.entries()).sort((a, b) => b[1].revenue - a[1].revenue);
  const achievementPct = percentage(totalRevenue, 100000 * profiles.length);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-primary">Lead Assignment</h1>
          <p className="text-secondary text-xs mt-0.5">Cycle: {cycleLabel}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setCycleOffset((p) => p - 1)} className="btn-secondary p-1.5"><ChevronLeft className="w-4 h-4" /></button>
          <button onClick={() => setCycleOffset(0)} className="btn-primary px-2.5 py-1.5 text-xs">Current</button>
          <button onClick={() => setCycleOffset((p) => p + 1)} className="btn-secondary p-1.5"><ChevronRight className="w-4 h-4" /></button>
          <div className="w-px h-5 mx-1" style={{ background: 'rgb(var(--border-default))' }} />
          <button onClick={() => setShowAdd(true)} className="btn-primary px-2.5 py-1.5 text-xs flex items-center gap-1"><Plus className="w-3.5 h-3.5" />Add</button>
          {hasRole('admin') && <button onClick={() => setShowBulkAdd(true)} className="btn-secondary px-2.5 py-1.5 text-xs flex items-center gap-1"><Plus className="w-3.5 h-3.5" />Bulk</button>}
          {selected.size > 0 && <button onClick={handleBulkDelete} className="px-2.5 py-1.5 text-xs rounded-lg flex items-center gap-1" style={{ background: 'rgb(var(--error) / 0.2)', color: 'rgb(var(--error))' }}><Trash2 className="w-3.5 h-3.5" />Delete ({selected.size})</button>}
        </div>
      </div>

      {/* Revenue Sync Banner */}
      <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'rgb(var(--info) / 0.1)', border: '1px solid rgb(var(--info) / 0.2)' }}>
        <IndianRupee className="w-4 h-4 flex-shrink-0" style={{ color: 'rgb(var(--info))' }} />
        <div>
          <p className="text-xs font-medium" style={{ color: 'rgb(var(--info))' }}>Revenue syncs to Dashboard, Reports, KPIs</p>
        </div>
      </div>

      {/* Summary Stats Row */}
      <div className="grid grid-cols-4 gap-3">
        <div className="card p-3">
          <p className="text-[10px] text-muted uppercase tracking-wider">Revenue</p>
          <p className="text-lg font-bold" style={{ color: 'rgb(var(--info))' }}>{formatINRShort(totalRevenue)}</p>
        </div>
        <div className="card p-3">
          <p className="text-[10px] text-muted uppercase tracking-wider">Leads</p>
          <p className="text-lg font-bold" style={{ color: 'rgb(var(--success))' }}>{totalLeads}</p>
        </div>
        <div className="card p-3">
          <p className="text-[10px] text-muted uppercase tracking-wider">Members</p>
          <p className="text-lg font-bold text-primary">{sortedMembers.length}</p>
        </div>
        <div className="card p-3">
          <p className="text-[10px] text-muted uppercase tracking-wider">Rate</p>
          <p className={cn('text-lg font-bold', achievementPct >= 100 ? 'text-success' : achievementPct >= 75 ? 'text-warning' : 'text-error')}>{achievementPct}%</p>
        </div>
      </div>

      {/* Search and Export */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." className="input pl-9 text-xs py-2" />
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
                <th className="text-left px-3 py-2 text-xs font-semibold text-secondary uppercase tracking-wider">Date</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-secondary uppercase tracking-wider">Leads</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-secondary uppercase tracking-wider">Revenue</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-secondary uppercase tracking-wider">Batch</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-secondary uppercase tracking-wider min-w-[120px]">Notes</th>
                <th className="px-2 py-2 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry) => (
                <tr key={entry.id} className={cn('table-row table-row-zebra', selected.has(entry.id) && 'bg-hover')}>
                  <td className="px-3 py-2"><input type="checkbox" checked={selected.has(entry.id)} onChange={() => toggleSelect(entry.id)} className="w-3.5 h-3.5 rounded" style={{ accentColor: 'rgb(var(--text-primary))' }} /></td>
                  <td className="px-3 py-2 text-primary font-medium truncate max-w-[140px]">{(entry.profile as any)?.full_name || (entry.profile as any)?.email || '-'}</td>
                  <td className="px-3 py-2">
                    {editingCell === `${entry.id}-assigned_date` ? (
                      <input type="date" value={editValue} onChange={(e) => setEditValue(e.target.value)} onBlur={() => handleCellSave(entry.id, 'assigned_date')} onKeyDown={(e) => e.key === 'Enter' && handleCellSave(entry.id, 'assigned_date')} autoFocus className="input py-1 text-xs w-28" />
                    ) : (
                      <span onClick={() => { setEditingCell(`${entry.id}-assigned_date`); setEditValue(entry.assigned_date); }} className="text-secondary cursor-pointer hover:text-primary px-1 py-0.5 rounded hover:bg-hover truncate">{format(new Date(entry.assigned_date), 'dd MMM')}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {editingCell === `${entry.id}-leads_assigned` ? (
                      <input type="number" value={editValue} onChange={(e) => setEditValue(e.target.value)} onBlur={() => handleCellSave(entry.id, 'leads_assigned')} onKeyDown={(e) => e.key === 'Enter' && handleCellSave(entry.id, 'leads_assigned')} autoFocus className="input py-1 text-xs w-14 text-right" />
                    ) : (
                      <span onClick={() => { setEditingCell(`${entry.id}-leads_assigned`); setEditValue(String(entry.leads_assigned)); }} className="text-secondary cursor-pointer hover:text-primary px-1 py-0.5 rounded hover:bg-hover">{entry.leads_assigned}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {editingCell === `${entry.id}-revenue` ? (
                      <input type="number" value={editValue} onChange={(e) => setEditValue(e.target.value)} onBlur={() => handleCellSave(entry.id, 'revenue')} onKeyDown={(e) => e.key === 'Enter' && handleCellSave(entry.id, 'revenue')} autoFocus className="input py-1 text-xs w-24 text-right" />
                    ) : (
                      <span onClick={() => { setEditingCell(`${entry.id}-revenue`); setEditValue(String(entry.revenue)); }} className="cursor-pointer hover:text-primary px-1 py-0.5 rounded hover:bg-hover font-medium" style={{ color: 'rgb(var(--info))' }}>{formatINRShort(Number(entry.revenue))}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {editingCell === `${entry.id}-batch_name` ? (
                      <input type="text" value={editValue} onChange={(e) => setEditValue(e.target.value)} onBlur={() => handleCellSave(entry.id, 'batch_name')} onKeyDown={(e) => e.key === 'Enter' && handleCellSave(entry.id, 'batch_name')} autoFocus className="input py-1 text-xs w-20" />
                    ) : (
                      <span onClick={() => { setEditingCell(`${entry.id}-batch_name`); setEditValue(entry.batch_name); }} className="text-secondary cursor-pointer hover:text-primary px-1 py-0.5 rounded hover:bg-hover truncate block max-w-[100px]">{entry.batch_name || '-'}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {editingCell === `${entry.id}-notes` ? (
                      <input type="text" value={editValue} onChange={(e) => setEditValue(e.target.value)} onBlur={() => handleCellSave(entry.id, 'notes')} onKeyDown={(e) => e.key === 'Enter' && handleCellSave(entry.id, 'notes')} autoFocus className="input py-1 text-xs w-full" />
                    ) : (
                      <span onClick={() => { setEditingCell(`${entry.id}-notes`); setEditValue(entry.notes || ''); }} className="text-muted cursor-pointer hover:text-primary px-1 py-0.5 rounded hover:bg-hover truncate block max-w-[100px]">{entry.notes || '-'}</span>
                    )}
                  </td>
                  <td className="px-2 py-2"><button onClick={() => handleDelete(entry.id)} className="p-1 text-muted hover:text-error transition-colors"><Trash2 className="w-3.5 h-3.5" /></button></td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-muted text-sm">No entries found</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Member Summary Matrix */}
      {sortedMembers.length > 0 && (
        <div className="table-container overflow-hidden">
          <div className="px-4 py-2 border-b" style={{ borderColor: 'rgb(var(--border-default))' }}>
            <h3 className="text-xs font-semibold text-secondary uppercase tracking-wider">Member Summary</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="table-header">
                <tr>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-secondary uppercase">Rank</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-secondary uppercase">Member</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-secondary uppercase">Leads</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-secondary uppercase">Revenue</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-secondary uppercase">Avg/Lead</th>
                </tr>
              </thead>
              <tbody>
                {sortedMembers.map(([id, agg], idx) => (
                  <tr key={id} className="table-row table-row-zebra">
                    <td className="px-4 py-2">
                      <span className={cn('inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold', idx === 0 ? 'badge-gold' : idx === 1 ? 'badge-silver' : idx === 2 ? 'badge-bronze' : 'badge')}>{idx + 1}</span>
                    </td>
                    <td className="px-4 py-2 text-primary font-medium">{agg.name}</td>
                    <td className="px-4 py-2 text-right text-secondary">{agg.leads}</td>
                    <td className="px-4 py-2 text-right font-semibold" style={{ color: 'rgb(var(--success))' }}>{formatINRShort(agg.revenue)}</td>
                    <td className="px-4 py-2 text-right text-muted">{agg.leads > 0 ? formatINRShort(Math.round(agg.revenue / agg.leads)) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Modal */}
      {showAdd && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowAdd(false)}>
          <form onSubmit={handleAdd} className="modal-content space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-primary">Add Entry</h2>
              <button type="button" onClick={() => setShowAdd(false)} className="text-secondary hover:text-primary"><X className="w-5 h-5" /></button>
            </div>
            {hasRole('admin') && (
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">Member</label>
                <select name="user_id" className="input"><option value="">Self</option>{profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}</select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">Date</label>
                <input name="assigned_date" type="date" required className="input" defaultValue={new Date().toISOString().split('T')[0]} />
              </div>
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">Leads</label>
                <input name="leads_assigned" type="number" min="0" className="input" defaultValue="0" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">Revenue</label>
                <input name="revenue" type="number" min="0" step="100" className="input" defaultValue="0" />
              </div>
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">Batch</label>
                <input name="batch_name" type="text" className="input" placeholder="Optional" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-secondary mb-1">Notes</label>
              <input name="notes" type="text" className="input" placeholder="Optional" />
            </div>
            <button type="submit" className="btn-primary w-full py-2 text-sm">Add Entry</button>
          </form>
        </div>
      )}

      {/* Bulk Add Modal */}
      {showBulkAdd && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowBulkAdd(false)}>
          <form onSubmit={handleBulkAdd} className="modal-content space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-primary">Bulk Add</h2>
              <button type="button" onClick={() => setShowBulkAdd(false)} className="text-secondary hover:text-primary"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-xs text-muted">Add entries for all {profiles.length} team members</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">Date</label>
                <input name="assigned_date" type="date" required className="input" defaultValue={new Date().toISOString().split('T')[0]} />
              </div>
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">Leads</label>
                <input name="leads_assigned" type="number" min="0" className="input" defaultValue="0" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">Revenue</label>
                <input name="revenue" type="number" min="0" step="100" className="input" defaultValue="0" />
              </div>
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">Batch</label>
                <input name="batch_name" type="text" className="input" placeholder="Optional" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-secondary mb-1">Notes</label>
              <input name="notes" type="text" className="input" placeholder="Optional" />
            </div>
            <button type="submit" className="btn-primary w-full py-2 text-sm">Add {profiles.length} Entries</button>
          </form>
        </div>
      )}
    </div>
  );
}
