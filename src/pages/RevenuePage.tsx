import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore, hasRole } from '../stores/authStore';
import { formatINR, formatINRShort, getBillingCycle, getBillingCycleLabel, cn } from '../lib/utils';
import { format } from 'date-fns';
import { Download, ChevronLeft, ChevronRight, IndianRupee, RefreshCw, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import Spinner from '../components/ui/Spinner';
import * as XLSX from 'xlsx';

interface RevenueRow {
  id: string;
  user_id: string;
  member_name: string;
  date: string;
  revenue: number;
  billing_cycle: string;
  notes: string;
  batch_name: string;
}

export default function RevenuePage() {
  const { profile } = useAuthStore();
  const [entries, setEntries] = useState<RevenueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState('');
  const [cycleOffset, setCycleOffset] = useState(0);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

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
        .select('id, user_id, assigned_date, revenue, notes, batch_name, billing_cycle_start, billing_cycle_end, profile:profiles(full_name, email)')
        .gte('billing_cycle_start', cs)
        .lte('billing_cycle_end', ce)
        .order('assigned_date', { ascending: false });

      if (profile?.role === 'team_member') query = query.eq('user_id', profile.id);

      const { data, error } = await query;
      if (error) throw error;

      const rows: RevenueRow[] = (data || []).map((l: any) => ({
        id: l.id,
        user_id: l.user_id,
        member_name: (l.profile as any)?.full_name || (l.profile as any)?.email || 'Unknown',
        date: l.assigned_date,
        revenue: Number(l.revenue),
        billing_cycle: `${l.billing_cycle_start} - ${l.billing_cycle_end}`,
        notes: l.notes || '',
        batch_name: l.batch_name || '',
      }));

      setEntries(rows);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load revenue data');
    } finally {
      setLoading(false);
    }
  }, [cycleOffset, profile]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await loadData();
      toast.success('Revenue data synced');
    } catch (err) {
      toast.error('Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const filtered = entries.filter((e) =>
    e.member_name.toLowerCase().includes(search.toLowerCase()) ||
    e.date.includes(search) ||
    e.batch_name.toLowerCase().includes(search.toLowerCase())
  );

  const toggleRow = (id: string) => {
    const next = new Set(selectedRows);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedRows(next);
  };

  const toggleAll = () => {
    if (selectedRows.size === filtered.length) setSelectedRows(new Set());
    else setSelectedRows(new Set(filtered.map((e) => e.id)));
  };

  const handleExport = (fmt: 'csv' | 'xlsx') => {
    const rows = filtered.map((e) => ({
      'Team Member': e.member_name,
      'Date': e.date,
      'Revenue': e.revenue,
      'Billing Cycle': e.billing_cycle,
      'Batch': e.batch_name,
      'Notes': e.notes,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Revenue');
    if (fmt === 'csv') {
      const csv = XLSX.utils.sheet_to_csv(ws);
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'revenue.csv'; a.click();
      URL.revokeObjectURL(url);
    } else {
      XLSX.writeFile(wb, 'revenue.xlsx');
    }
    toast.success(`Exported as ${fmt.toUpperCase()}`);
  };

  // Aggregate by member
  const memberTotal = new Map<string, { name: string; revenue: number; entries: number }>();
  entries.forEach((e) => {
    if (!memberTotal.has(e.user_id)) memberTotal.set(e.user_id, { name: e.member_name, revenue: 0, entries: 0 });
    const agg = memberTotal.get(e.user_id)!;
    agg.revenue += e.revenue;
    agg.entries += 1;
  });

  const totalRevenue = entries.reduce((s, e) => s + e.revenue, 0);
  const totalEntries = entries.length;
  const avgRevenue = totalEntries > 0 ? totalRevenue / totalEntries : 0;
  const sortedMembers = Array.from(memberTotal.entries()).sort((a, b) => b[1].revenue - a[1].revenue);

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><Spinner size="lg" /></div>;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-primary">Revenue Tracking</h1>
          <p className="text-secondary text-xs mt-0.5">Auto-synced from Lead Assignments | {cycleLabel}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setCycleOffset((p) => p - 1)} className="btn-secondary p-1.5"><ChevronLeft className="w-4 h-4" /></button>
          <button onClick={() => setCycleOffset(0)} className="btn-primary px-2.5 py-1.5 text-xs">Current</button>
          <button onClick={() => setCycleOffset((p) => p + 1)} className="btn-secondary p-1.5"><ChevronRight className="w-4 h-4" /></button>
          <div className="w-px h-5 mx-1" style={{ background: 'rgb(var(--border-default))' }} />
          <button onClick={handleSync} disabled={syncing} className="btn-primary px-2.5 py-1.5 text-xs flex items-center gap-1"><RefreshCw className={cn('w-3.5 h-3.5', syncing && 'animate-spin')} />{syncing ? 'Syncing...' : 'Sync'}</button>
          <button onClick={() => handleExport('csv')} className="btn-ghost px-2 py-1.5 text-xs rounded-lg flex items-center gap-1"><Download className="w-3 h-3" />CSV</button>
          <button onClick={() => handleExport('xlsx')} className="btn-ghost px-2 py-1.5 text-xs rounded-lg flex items-center gap-1"><Download className="w-3 h-3" />XLSX</button>
        </div>
      </div>

      {/* Sync Banner */}
      <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'rgb(var(--success) / 0.1)', border: '1px solid rgb(var(--success) / 0.2)' }}>
        <IndianRupee className="w-4 h-4 flex-shrink-0" style={{ color: 'rgb(var(--success))' }} />
        <p className="text-xs" style={{ color: 'rgb(var(--success))' }}>Revenue entries are automatically pulled from Lead Assignments module</p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-3">
        <div className="card p-3">
          <p className="text-[10px] text-muted uppercase tracking-wider">Total</p>
          <p className="text-lg font-bold" style={{ color: 'rgb(var(--success))' }}>{formatINRShort(totalRevenue)}</p>
        </div>
        <div className="card p-3">
          <p className="text-[10px] text-muted uppercase tracking-wider">Entries</p>
          <p className="text-lg font-bold text-primary">{totalEntries}</p>
        </div>
        <div className="card p-3">
          <p className="text-[10px] text-muted uppercase tracking-wider">Avg</p>
          <p className="text-lg font-bold" style={{ color: 'rgb(var(--info))' }}>{formatINRShort(avgRevenue)}</p>
        </div>
        <div className="card p-3">
          <p className="text-[10px] text-muted uppercase tracking-wider">Members</p>
          <p className="text-lg font-bold text-primary">{memberTotal.size}</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." className="input pl-9 text-xs py-2 w-full" />
      </div>

      {/* Member Summary Matrix */}
      {sortedMembers.length > 0 && (
        <div className="table-container overflow-hidden">
          <div className="px-4 py-2 border-b" style={{ borderColor: 'rgb(var(--border-default))' }}>
            <h3 className="text-xs font-semibold text-secondary uppercase tracking-wider">Revenue by Member</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="table-header">
                <tr>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-secondary uppercase">Rank</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-secondary uppercase">Member</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-secondary uppercase">Entries</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-secondary uppercase">Revenue</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-secondary uppercase">Avg</th>
                </tr>
              </thead>
              <tbody>
                {sortedMembers.map(([id, agg], idx) => (
                  <tr key={id} className="table-row table-row-zebra">
                    <td className="px-4 py-2">
                      <span className={cn('inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold', idx === 0 ? 'badge-gold' : idx === 1 ? 'badge-silver' : idx === 2 ? 'badge-bronze' : 'badge')}>{idx + 1}</span>
                    </td>
                    <td className="px-4 py-2 text-primary font-medium">{agg.name}</td>
                    <td className="px-4 py-2 text-right text-secondary">{agg.entries}</td>
                    <td className="px-4 py-2 text-right font-semibold" style={{ color: 'rgb(var(--success))' }}>{formatINRShort(agg.revenue)}</td>
                    <td className="px-4 py-2 text-right text-muted">{formatINRShort(agg.revenue / agg.entries)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Main Matrix Table */}
      <div className="table-container overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="table-header">
              <tr>
                {hasRole('admin') && (
                  <th className="px-3 py-2 w-8">
                    <input type="checkbox" checked={selectedRows.size === filtered.length && filtered.length > 0} onChange={toggleAll} className="w-3.5 h-3.5 rounded" style={{ accentColor: 'rgb(var(--text-primary))' }} />
                  </th>
                )}
                <th className="text-left px-3 py-2 text-xs font-semibold text-secondary uppercase tracking-wider">Member</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-secondary uppercase tracking-wider">Date</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-secondary uppercase tracking-wider">Revenue</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-secondary uppercase tracking-wider">Batch</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-secondary uppercase tracking-wider min-w-[100px]">Notes</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry) => (
                <tr key={entry.id} className={cn('table-row table-row-zebra', selectedRows.has(entry.id) && 'bg-hover')}>
                  {hasRole('admin') && (
                    <td className="px-3 py-2"><input type="checkbox" checked={selectedRows.has(entry.id)} onChange={() => toggleRow(entry.id)} className="w-3.5 h-3.5 rounded" style={{ accentColor: 'rgb(var(--text-primary))' }} /></td>
                  )}
                  <td className="px-3 py-2 text-primary font-medium truncate max-w-[120px]">{entry.member_name}</td>
                  <td className="px-3 py-2 text-secondary">{format(new Date(entry.date), 'dd MMM')}</td>
                  <td className="px-3 py-2 text-right font-semibold" style={{ color: 'rgb(var(--success))' }}>{formatINRShort(entry.revenue)}</td>
                  <td className="px-3 py-2 text-secondary truncate max-w-[80px]">{entry.batch_name || '-'}</td>
                  <td className="px-3 py-2 text-muted truncate max-w-[100px]">{entry.notes || '-'}</td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={hasRole('admin') ? 6 : 5} className="px-4 py-8 text-center text-muted text-sm">No revenue entries</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
