import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore, hasRole } from '../stores/authStore';
import type { AttendanceEntry, AttendanceStatus, Profile } from '../types';
import { cn, percentage, getBillingCycle, getBillingCycleLabel } from '../lib/utils';
import { format } from 'date-fns';
import {
  Plus, Trash2, ChevronLeft, ChevronRight, Search,
  Download, Upload, X, AlertCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Spinner from '../components/ui/Spinner';
import * as XLSX from 'xlsx';

const statusConfig: Record<AttendanceStatus, { label: string; short: string; color: string }> = {
  present: { label: 'Present', short: 'P', color: 'rgb(var(--success))' },
  absent: { label: 'Absent', short: 'A', color: 'rgb(var(--error))' },
  half_day: { label: 'Half Day', short: 'HD', color: 'rgb(var(--warning))' },
  leave: { label: 'Leave', short: 'L', color: 'rgb(var(--info))' },
  week_off: { label: 'Week Off', short: 'WO', color: 'rgb(var(--text-muted))' },
};

const statuses: AttendanceStatus[] = ['present', 'absent', 'half_day', 'leave', 'week_off'];

export default function AttendancePage() {
  const { profile } = useAuthStore();
  const [entries, setEntries] = useState<AttendanceEntry[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [cycleOffset, setCycleOffset] = useState(0);
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<'date' | 'user_id' | 'status'>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [filterStatus, setFilterStatus] = useState<string>('all');
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
        .from('attendance_entries')
        .select('*, profile:profiles(full_name, email)')
        .gte('date', cs)
        .lte('date', ce);

      if (profile?.role === 'team_member') query = query.eq('user_id', profile.id);

      const [entriesRes, profilesRes] = await Promise.all([
        query.order('date', { ascending: false }),
        hasRole('admin') ? supabase.from('profiles').select('*').eq('is_active', true) : Promise.resolve({ data: profile ? [profile] : [] }),
      ]);

      setEntries((entriesRes.data as AttendanceEntry[]) || []);
      setProfiles((profilesRes.data as Profile[]) || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [cycleOffset, profile]);

  useEffect(() => { loadData(); }, [loadData]);

  // Attendance % - week_off does NOT reduce percentage
  const calcAttendancePct = () => {
    const counted = entries.filter((e) => e.status !== 'week_off');
    const present = counted.filter((e) => e.status === 'present' || e.status === 'half_day').length;
    return percentage(present, counted.length);
  };

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  let filtered = entries.filter((e) =>
    ((e.profile as any)?.full_name || '').toLowerCase().includes(search.toLowerCase()) ||
    e.date.includes(search)
  );
  if (filterStatus !== 'all') filtered = filtered.filter((e) => e.status === filterStatus);
  filtered.sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    if (sortField === 'date') return dir * a.date.localeCompare(b.date);
    if (sortField === 'user_id') return dir * ((a.profile as any)?.full_name || '').localeCompare((b.profile as any)?.full_name || '');
    return dir * a.status.localeCompare(b.status);
  });

  const handleCellSave = async (id: string, field: string) => {
    try {
      const { error } = await supabase.from('attendance_entries').update({ [field]: editValue }).eq('id', id);
      if (error) throw error;
      toast.success('Updated');
      setEditingCell(null);
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Update failed');
    }
  };

  const handleStatusChange = async (id: string, status: AttendanceStatus) => {
    try {
      const { error } = await supabase.from('attendance_entries').update({ status }).eq('id', id);
      if (error) throw error;
      toast.success('Status updated');
      loadData();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleAdd = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = {
      user_id: (form.elements.namedItem('user_id') as HTMLSelectElement).value || profile?.id,
      date: (form.elements.namedItem('date') as HTMLInputElement).value,
      status: (form.elements.namedItem('status') as HTMLSelectElement).value,
      notes: (form.elements.namedItem('notes') as HTMLInputElement).value,
    };
    if (!data.date) { toast.error('Date required'); return; }
    try {
      const { error } = await supabase.from('attendance_entries').upsert(data, { onConflict: 'user_id,date' });
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
    const date = (form.elements.namedItem('date') as HTMLInputElement).value;
    const status = (form.elements.namedItem('status') as HTMLSelectElement).value;
    const notes = (form.elements.namedItem('notes') as HTMLInputElement).value;
    if (!date) { toast.error('Date required'); return; }

    const memberIds = profiles.map((p) => p.id);
    const rows = memberIds.map((uid) => ({ user_id: uid, date, status, notes }));

    try {
      const { error } = await supabase.from('attendance_entries').upsert(rows, { onConflict: 'user_id,date' });
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
      const { error } = await supabase.from('attendance_entries').delete().in('id', Array.from(selected));
      if (error) throw error;
      toast.success(`${selected.size} entries deleted`);
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
    else setSelected(new Set(filtered.map((e) => e.id)));
  };

  const handleExport = (fmt: 'csv' | 'xlsx') => {
    const rows = filtered.map((e) => ({
      'Team Member': (e.profile as any)?.full_name || '',
      'Date': e.date,
      'Status': statusConfig[e.status].label,
      'Notes': e.notes || '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
    if (fmt === 'csv') {
      const csv = XLSX.utils.sheet_to_csv(ws);
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'attendance.csv'; a.click();
      URL.revokeObjectURL(url);
    } else {
      XLSX.writeFile(wb, 'attendance.xlsx');
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
        return {
          user_id: userId,
          date: String(row['Date'] || '').split('T')[0],
          status: parseStatus(String(row['Status'] || '')),
          notes: String(row['Notes'] || ''),
        };
      }).filter((e) => e.user_id && e.date);

      if (toInsert.length === 0) { toast.error('No valid rows found'); return; }

      const { error } = await supabase.from('attendance_entries').upsert(toInsert, { onConflict: 'user_id,date' });
      if (error) throw error;
      toast.success(`${toInsert.length} entries imported`);
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Import failed');
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const parseStatus = (s: string): AttendanceStatus => {
    const lower = s.toLowerCase().replace(/\s+/g, '_');
    if (statuses.includes(lower as AttendanceStatus)) return lower as AttendanceStatus;
    if (lower === 'p' || lower === 'present') return 'present';
    if (lower === 'a' || lower === 'absent') return 'absent';
    if (lower === 'hd' || lower === 'half_day') return 'half_day';
    if (lower === 'l' || lower === 'leave') return 'leave';
    if (lower === 'wo' || lower === 'week_off') return 'week_off';
    return 'present';
  };

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><Spinner size="lg" /></div>;

  const attPct = calcAttendancePct();
  const presentCount = entries.filter((e) => e.status === 'present').length;
  const absentCount = entries.filter((e) => e.status === 'absent').length;
  const weekOffCount = entries.filter((e) => e.status === 'week_off').length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-primary">Attendance</h1>
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

      {/* Summary Stats Row */}
      <div className="grid grid-cols-4 gap-3">
        <div className="card p-3">
          <p className="text-[10px] text-muted uppercase tracking-wider">Attendance %</p>
          <p className={cn('text-lg font-bold', attPct >= 90 ? 'text-success' : attPct >= 75 ? 'text-warning' : 'text-error')}>{attPct}%</p>
          <p className="text-[10px] text-muted">Week Off excluded</p>
        </div>
        <div className="card p-3">
          <p className="text-[10px] text-muted uppercase tracking-wider">Present</p>
          <p className="text-lg font-bold" style={{ color: 'rgb(var(--success))' }}>{presentCount}</p>
        </div>
        <div className="card p-3">
          <p className="text-[10px] text-muted uppercase tracking-wider">Absent</p>
          <p className="text-lg font-bold" style={{ color: 'rgb(var(--error))' }}>{absentCount}</p>
        </div>
        <div className="card p-3">
          <p className="text-[10px] text-muted uppercase tracking-wider">Week Off</p>
          <p className="text-lg font-bold text-muted">{weekOffCount}</p>
        </div>
      </div>

      {/* Search and Export */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search member or date..." className="input pl-9 text-xs py-2" />
        </div>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="input px-3 py-2 text-xs">
          <option value="all">All Statuses</option>
          {statuses.map((s) => <option key={s} value={s}>{statusConfig[s].label}</option>)}
        </select>
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
                <th className="text-left px-3 py-2 text-xs font-semibold text-secondary uppercase tracking-wider cursor-pointer" onClick={() => handleSort('user_id')}>Member {sortField === 'user_id' && (sortDir === 'asc' ? '^' : 'v')}</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-secondary uppercase tracking-wider cursor-pointer" onClick={() => handleSort('date')}>Date {sortField === 'date' && (sortDir === 'asc' ? '^' : 'v')}</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-secondary uppercase tracking-wider cursor-pointer" onClick={() => handleSort('status')}>Status {sortField === 'status' && (sortDir === 'asc' ? '^' : 'v')}</th>
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
                    <span className="text-secondary truncate">{format(new Date(entry.date), 'dd MMM yyyy')}</span>
                  </td>
                  <td className="px-3 py-2">
                    <select value={entry.status} onChange={(e) => handleStatusChange(entry.id, e.target.value as AttendanceStatus)}
                      className="text-xs font-semibold rounded-lg px-2 py-1 border-0 outline-none cursor-pointer bg-transparent"
                      style={{ color: statusConfig[entry.status].color }}>
                      {statuses.map((s) => <option key={s} value={s}>{statusConfig[s].label}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    {editingCell === `${entry.id}-notes` ? (
                      <input type="text" value={editValue} onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() => handleCellSave(entry.id, 'notes')} onKeyDown={(e) => e.key === 'Enter' && handleCellSave(entry.id, 'notes')} autoFocus
                        className="input py-1 text-xs w-full" />
                    ) : (
                      <span onClick={() => { setEditingCell(`${entry.id}-notes`); setEditValue(entry.notes || ''); }}
                        className="text-muted cursor-pointer hover:text-primary px-1 py-0.5 rounded hover:bg-hover truncate block max-w-[150px]">
                        {entry.notes || '-'}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    <button onClick={async () => {
                      if (!confirm('Delete?')) return;
                      try { await supabase.from('attendance_entries').delete().eq('id', entry.id); toast.success('Deleted'); loadData(); }
                      catch (err: any) { toast.error(err.message); }
                    }} className="p-1 text-muted hover:text-error transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted text-sm">No attendance records found</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Modal */}
      {showAdd && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowAdd(false)}>
          <form onSubmit={handleAdd} className="modal-content space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-primary">Add Attendance</h2>
              <button type="button" onClick={() => setShowAdd(false)} className="text-secondary hover:text-primary"><X className="w-5 h-5" /></button>
            </div>
            {hasRole('admin') && (
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">Team Member</label>
                <select name="user_id" className="input"><option value="">Self</option>{profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}</select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">Date</label>
                <input name="date" type="date" required className="input" defaultValue={new Date().toISOString().split('T')[0]} />
              </div>
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">Status</label>
                <select name="status" className="input">{statuses.map((s) => <option key={s} value={s}>{statusConfig[s].label}</option>)}</select>
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
              <h2 className="text-base font-bold text-primary">Bulk Add Attendance</h2>
              <button type="button" onClick={() => setShowBulkAdd(false)} className="text-secondary hover:text-primary"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex items-center gap-2 p-3 rounded-lg" style={{ background: 'rgb(var(--warning) / 0.1)', border: '1px solid rgb(var(--warning) / 0.2)' }}>
              <AlertCircle className="w-4 h-4 flex-shrink-0" style={{ color: 'rgb(var(--warning))' }} />
              <p className="text-xs" style={{ color: 'rgb(var(--warning))' }}>This will mark ALL {profiles.length} team members with the same status for the selected date.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">Date</label>
                <input name="date" type="date" required className="input" defaultValue={new Date().toISOString().split('T')[0]} />
              </div>
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">Status</label>
                <select name="status" className="input">{statuses.map((s) => <option key={s} value={s}>{statusConfig[s].label}</option>)}</select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-secondary mb-1">Notes</label>
              <input name="notes" type="text" className="input" placeholder="Optional" />
            </div>
            <button type="submit" className="btn-primary w-full py-2 text-sm">Add for All Members</button>
          </form>
        </div>
      )}
    </div>
  );
}
