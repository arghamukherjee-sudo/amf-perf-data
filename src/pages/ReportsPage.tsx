import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore, hasRole } from '../stores/authStore';
import type { Profile } from '../types';
import { formatINR, percentage, getBillingCycle, getBillingCycleLabel, cn } from '../lib/utils';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays } from 'date-fns';
import {
  FileText, Download, Calendar, Users, IndianRupee, Phone, Clock, BarChart3,
  ChevronLeft, ChevronRight, X, Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Spinner from '../components/ui/Spinner';
import * as XLSX from 'xlsx';

type ReportType = 'weekly' | 'monthly' | 'attendance' | 'kpi' | 'revenue';

interface ReportData {
  member_name: string;
  revenue?: number;
  leads?: number;
  calls?: number;
  talkTime?: number;
  attendance?: number;
  [key: string]: any;
}

export default function ReportsPage() {
  const { profile } = useAuthStore();
  const [reportType, setReportType] = useState<ReportType>('weekly');
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({
    start: subDays(new Date(), 7).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0],
  });
  const [data, setData] = useState<ReportData[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const cycleDate = new Date();
  const cycle = getBillingCycle(cycleDate);

  const presets: Record<ReportType, () => { start: string; end: string }> = {
    weekly: () => ({
      start: startOfWeek(new Date(), { weekStartsOn: 1 }).toISOString().split('T')[0],
      end: endOfWeek(new Date(), { weekStartsOn: 1 }).toISOString().split('T')[0],
    }),
    monthly: () => ({
      start: startOfMonth(new Date()).toISOString().split('T')[0],
      end: endOfMonth(new Date()).toISOString().split('T')[0],
    }),
    attendance: () => ({
      start: startOfMonth(new Date()).toISOString().split('T')[0],
      end: endOfMonth(new Date()).toISOString().split('T')[0],
    }),
    kpi: () => ({
      start: startOfWeek(new Date(), { weekStartsOn: 1 }).toISOString().split('T')[0],
      end: endOfWeek(new Date(), { weekStartsOn: 1 }).toISOString().split('T')[0],
    }),
    revenue: () => ({
      start: startOfMonth(new Date()).toISOString().split('T')[0],
      end: endOfMonth(new Date()).toISOString().split('T')[0],
    }),
  };

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      const { start, end } = dateRange;
      let reportData: ReportData[] = [];

      const { data: profiles } = await supabase.from('profiles').select('id, full_name, email').eq('is_active', true);
      const profileMap = new Map((profiles || []).map((p) => [p.id, p.full_name || p.email]));

      if (reportType === 'revenue') {
        const { data: leads } = await supabase.from('lead_assignments').select('user_id, revenue, leads_assigned').gte('assigned_date', start).lte('assigned_date', end);
        const agg = new Map<string, { revenue: number; leads: number }>();
        (leads || []).forEach((l: any) => {
          if (!agg.has(l.user_id)) agg.set(l.user_id, { revenue: 0, leads: 0 });
          const a = agg.get(l.user_id)!;
          a.revenue += Number(l.revenue) || 0;
          a.leads += Number(l.leads_assigned) || 0;
        });
        reportData = Array.from(agg.entries()).map(([uid, val]) => ({
          member_name: profileMap.get(uid) || 'Unknown',
          revenue: val.revenue,
          leads: val.leads,
          arpu: val.leads > 0 ? val.revenue / val.leads : 0,
        }));
      } else if (reportType === 'attendance') {
        const { data: att } = await supabase.from('attendance_entries').select('user_id, status').gte('date', start).lte('date', end);
        const agg = new Map<string, { present: number; total: number }>();
        (att || []).forEach((a: any) => {
          if (a.status === 'week_off') return;
          if (!agg.has(a.user_id)) agg.set(a.user_id, { present: 0, total: 0 });
          const entry = agg.get(a.user_id)!;
          entry.total += 1;
          if (a.status === 'present' || a.status === 'half_day') entry.present += 1;
        });
        reportData = Array.from(agg.entries()).map(([uid, val]) => ({
          member_name: profileMap.get(uid) || 'Unknown',
          present: val.present,
          absent: val.total - val.present,
          total: val.total,
          attendance: percentage(val.present, val.total),
        }));
      } else if (reportType === 'kpi') {
        const { data: kpi } = await supabase.from('daily_kpi').select('user_id, call_attempts, talk_time').gte('date', start).lte('date', end);
        const agg = new Map<string, { calls: number; time: number; days: number }>();
        (kpi || []).forEach((k: any) => {
          if (!agg.has(k.user_id)) agg.set(k.user_id, { calls: 0, time: 0, days: 0 });
          const entry = agg.get(k.user_id)!;
          entry.calls += Number(k.call_attempts) || 0;
          entry.time += Number(k.talk_time) || 0;
          entry.days += 1;
        });
        reportData = Array.from(agg.entries()).map(([uid, val]) => ({
          member_name: profileMap.get(uid) || 'Unknown',
          calls: val.calls,
          talkTime: Math.round(val.time / 60),
          avgCalls: val.days > 0 ? Math.round(val.calls / val.days) : 0,
        }));
      } else {
        const [leadsRes, attRes, kpiRes] = await Promise.all([
          supabase.from('lead_assignments').select('user_id, revenue, leads_assigned').gte('assigned_date', start).lte('assigned_date', end),
          supabase.from('attendance_entries').select('user_id, status').gte('date', start).lte('date', end),
          supabase.from('daily_kpi').select('user_id, call_attempts, talk_time').gte('date', start).lte('date', end),
        ]);

        const revenueAgg = new Map<string, { revenue: number; leads: number }>();
        (leadsRes.data || []).forEach((l: any) => {
          if (!revenueAgg.has(l.user_id)) revenueAgg.set(l.user_id, { revenue: 0, leads: 0 });
          const a = revenueAgg.get(l.user_id)!;
          a.revenue += Number(l.revenue) || 0;
          a.leads += Number(l.leads_assigned) || 0;
        });

        const attAgg = new Map<string, { present: number; total: number }>();
        (attRes.data || []).forEach((a: any) => {
          if (a.status === 'week_off') return;
          if (!attAgg.has(a.user_id)) attAgg.set(a.user_id, { present: 0, total: 0 });
          const entry = attAgg.get(a.user_id)!;
          entry.total += 1;
          if (a.status === 'present' || a.status === 'half_day') entry.present += 1;
        });

        const kpiAgg = new Map<string, { calls: number; time: number }>();
        (kpiRes.data || []).forEach((k: any) => {
          if (!kpiAgg.has(k.user_id)) kpiAgg.set(k.user_id, { calls: 0, time: 0 });
          const entry = kpiAgg.get(k.user_id)!;
          entry.calls += Number(k.call_attempts) || 0;
          entry.time += Number(k.talk_time) || 0;
        });

        reportData = Array.from(profileMap.entries()).map(([uid, name]) => {
          const rev = revenueAgg.get(uid) || { revenue: 0, leads: 0 };
          const att = attAgg.get(uid) || { present: 0, total: 0 };
          const kpi = kpiAgg.get(uid) || { calls: 0, time: 0 };
          return {
            member_name: name,
            revenue: rev.revenue,
            leads: rev.leads,
            attendance: att.total > 0 ? percentage(att.present, att.total) : 0,
            calls: kpi.calls,
            talkTime: Math.round(kpi.time / 60),
            arpu: rev.leads > 0 ? rev.revenue / rev.leads : 0,
          };
        });
      }

      setData(reportData.sort((a, b) => (b.revenue || 0) - (a.revenue || 0)));
    } catch (err) {
      console.error(err);
      toast.error('Failed to load report');
    } finally {
      setLoading(false);
    }
  }, [reportType, dateRange]);

  useEffect(() => { loadReport(); }, [loadReport]);

  const applyPreset = () => {
    const range = presets[reportType]();
    setDateRange(range);
  };

  const exportToCSV = () => {
    if (data.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(data);
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${reportType}_report_${dateRange.start}_${dateRange.end}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Exported as CSV');
  };

  const exportToXLSX = () => {
    if (data.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Report');
    XLSX.writeFile(wb, `${reportType}_report_${dateRange.start}_${dateRange.end}.xlsx`);
    toast.success('Exported as XLSX');
  };

  const exportToPDF = async () => {
    setExporting(true);
    try {
      const html = `<!DOCTYPE html><html><head><title>${reportType} Report</title>
        <style>body{font-family:system-ui,sans-serif;padding:20px}h1{color:#1e293b}table{width:100%;border-collapse:collapse;margin-top:20px}
        th,td{border:1px solid #cbd5e1;padding:8px;text-align:left}th{background:#1e293b;color:#fff}tr:nth-child(even){background:#f1f5f9}</style></head>
        <body><h1>${reportType.charAt(0).toUpperCase() + reportType.slice(1)} Report (${dateRange.start} - ${dateRange.end})</h1>
        <table><thead><tr>${Object.keys(data[0] || {}).map(k => `<th>${k}</th>`).join('')}</tr></thead>
        <tbody>${data.map(row => `<tr>${Object.values(row).map((v: any) => `<td>${typeof v === 'number' ? v.toLocaleString() : v}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`;
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.print();
        toast.success('PDF export dialog opened');
      }
    } catch (err) {
      toast.error('Failed to export PDF');
    } finally {
      setExporting(false);
    }
  };

  const reportConfig: Record<ReportType, { icon: React.ElementType; label: string }> = {
    weekly: { icon: Calendar, label: 'Weekly' },
    monthly: { icon: Calendar, label: 'Monthly' },
    attendance: { icon: Users, label: 'Attendance' },
    kpi: { icon: BarChart3, label: 'KPI' },
    revenue: { icon: IndianRupee, label: 'Revenue' },
  };

  const columns: Record<ReportType, { key: string; label: string; format?: (v: any) => string }[]> = {
    weekly: [
      { key: 'member_name', label: 'Member' },
      { key: 'revenue', label: 'Revenue', format: (v) => formatINR(v) },
      { key: 'leads', label: 'Leads' },
      { key: 'attendance', label: 'Att %', format: (v) => `${v}%` },
      { key: 'calls', label: 'Calls' },
      { key: 'talkTime', label: 'Talk(m)' },
      { key: 'arpu', label: 'ARPU', format: (v) => formatINR(v) },
    ],
    monthly: [
      { key: 'member_name', label: 'Member' },
      { key: 'revenue', label: 'Revenue', format: (v) => formatINR(v) },
      { key: 'leads', label: 'Leads' },
      { key: 'attendance', label: 'Att %', format: (v) => `${v}%` },
      { key: 'calls', label: 'Calls' },
      { key: 'talkTime', label: 'Talk(m)' },
      { key: 'arpu', label: 'ARPU', format: (v) => formatINR(v) },
    ],
    attendance: [
      { key: 'member_name', label: 'Member' },
      { key: 'present', label: 'Present' },
      { key: 'absent', label: 'Absent' },
      { key: 'total', label: 'Total' },
      { key: 'attendance', label: '%', format: (v) => `${v}%` },
    ],
    kpi: [
      { key: 'member_name', label: 'Member' },
      { key: 'calls', label: 'Calls' },
      { key: 'talkTime', label: 'Talk(m)' },
      { key: 'avgCalls', label: 'Avg/D' },
    ],
    revenue: [
      { key: 'member_name', label: 'Member' },
      { key: 'revenue', label: 'Revenue', format: (v) => formatINR(v) },
      { key: 'leads', label: 'Leads' },
      { key: 'arpu', label: 'ARPU', format: (v) => formatINR(v) },
    ],
  };

  const config = reportConfig[reportType];
  const Icon = config.icon;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary">Reports Center</h1>
          <p className="text-secondary text-sm mt-1">Generate and export reports</p>
        </div>
        <div className="flex items-center gap-1">
          {(Object.entries(reportConfig) as [ReportType, typeof config][]).map(([key, cfg]) => (
            <button key={key} onClick={() => setReportType(key)} className={cn('px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-1', reportType === key ? 'btn-primary' : 'btn-secondary')}>
              <cfg.icon className="w-4 h-4" />
            </button>
          ))}
        </div>
      </div>

      <div className="card rounded-2xl p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div><label className="block text-xs text-secondary mb-1">From</label>
            <input type="date" value={dateRange.start} onChange={(e) => setDateRange((d) => ({ ...d, start: e.target.value }))} className="input px-3 py-2 text-sm" /></div>
          <div><label className="block text-xs text-secondary mb-1">To</label>
            <input type="date" value={dateRange.end} onChange={(e) => setDateRange((d) => ({ ...d, end: e.target.value }))} className="input px-3 py-2 text-sm" /></div>
          <button onClick={applyPreset} className="btn-secondary mt-5">Preset</button>
          <div className="flex-1" />
          <button onClick={exportToCSV} disabled={data.length === 0} className="btn-secondary text-xs flex items-center gap-1 mt-5 disabled:opacity-50"><Download className="w-3.5 h-3.5" />CSV</button>
          <button onClick={exportToXLSX} disabled={data.length === 0} className="btn-secondary text-xs flex items-center gap-1 mt-5 disabled:opacity-50"><Download className="w-3.5 h-3.5" />XLSX</button>
          <button onClick={exportToPDF} disabled={exporting || data.length === 0} className="px-3 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs rounded-lg flex items-center gap-1 mt-5">
            {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}PDF</button>
        </div>
      </div>

      {loading ? <div className="flex items-center justify-center min-h-[40vh]"><Spinner size="lg" /></div> : (
        <div className="table-container rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-[rgb(var(--border-default))]">
            <h3 className="text-lg font-semibold text-primary">{config.label} Report</h3>
            <p className="text-xs text-secondary">{dateRange.start} to {dateRange.end} | {data.length} records</p>
          </div>
          {data.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="table-header sticky top-0">
                  <tr>
                    {columns[reportType].map((col) => (<th key={col.key} className="text-left px-4 py-3 text-xs font-semibold text-secondary uppercase">{col.label}</th>))}
                  </tr>
                </thead>
                <tbody>
                  {data.map((row, i) => (
                    <tr key={i} className="table-row">
                      {columns[reportType].map((col) => (
                        <td key={col.key} className="px-4 py-3 text-sm text-primary">{col.format ? col.format(row[col.key]) : row[col.key]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className="p-12 text-center text-secondary text-sm">No data for the selected period</div>}
        </div>
      )}
    </div>
  );
}
