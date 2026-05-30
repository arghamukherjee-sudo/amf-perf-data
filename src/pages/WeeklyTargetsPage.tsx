import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore, hasRole } from '../stores/authStore';
import type { Profile } from '../types';
import { formatINRShort, percentage, cn } from '../lib/utils';
import { format, addDays, parseISO, isWeekend, endOfWeek } from 'date-fns';
import { Calendar, Plus, Trash2, X, ChevronLeft, ChevronRight, Save, Check, ChevronDown } from 'lucide-react';
import toast from 'react-hot-toast';
import Spinner from '../components/ui/Spinner';

interface WeeklyMatrix {
  id: string;
  matrix_name: string;
  period_start: string;
  period_end: string;
  is_current: boolean;
}

interface DailyTargetMatrix {
  id: string;
  user_id: string;
  profile?: { full_name: string; email: string } | null;
  period_start: string;
  period_end: string;
  matrix_name: string;
  is_current: boolean;
  daily_achieved: Record<string, number>;
  total_target: number;
  total_achieved: number;
}

// Generate array of dates between start and end
function generateDateRange(startDate: Date, endDate: Date): Date[] {
  const dates: Date[] = [];
  let current = startDate;
  while (current <= endDate) {
    dates.push(new Date(current));
    current = addDays(current, 1);
  }
  return dates;
}

// Format date for display in column header
function formatDateHeader(date: Date): string {
  const day = format(date, 'd/M');
  const weekday = format(date, 'EEE');
  return `${day} ${weekday}`;
}

// Generate default matrix name
function generateMatrixName(startDate: Date, endDate: Date): string {
  return `Week ${format(startDate, 'w')} - ${format(startDate, 'MMM yyyy')}`;
}

export default function WeeklyTargetsPage() {
  const { profile } = useAuthStore();
  const [matrixData, setMatrixData] = useState<DailyTargetMatrix[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [savedMatrices, setSavedMatrices] = useState<WeeklyMatrix[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Local state for unsaved changes
  const [localData, setLocalData] = useState<Record<string, { daily_achieved: Record<string, number>; total_target: number }>>({});

  // Date range state
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showMatrixSelector, setShowMatrixSelector] = useState(false);
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfWeek(new Date()), 'yyyy-MM-dd'));
  const [matrixName, setMatrixName] = useState('');
  const [activePeriod, setActivePeriod] = useState<{ start: Date; end: Date; name: string } | null>(null);

  // Ref to track loaded period and prevent reload loops
  const loadedPeriodRef = useRef<string | null>(null);

  // Generate dates for current period
  const dateRange = activePeriod ? generateDateRange(activePeriod.start, activePeriod.end) : [];

  // Load matrix data for a specific period
  const loadMatrixData = async (period: { start: Date; end: Date; name: string }, forceReload = false) => {
    const periodKey = `${format(period.start, 'yyyy-MM-dd')}_${format(period.end, 'yyyy-MM-dd')}`;

    // Skip if already loaded this period (unless forced)
    if (!forceReload && loadedPeriodRef.current === periodKey) {
      return;
    }

    setLoading(true);
    try {
      const startStr = format(period.start, 'yyyy-MM-dd');
      const endStr = format(period.end, 'yyyy-MM-dd');

      const { data, error } = await supabase
        .from('weekly_target_matrix')
        .select('id, user_id, period_start, period_end, matrix_name, is_current, daily_achieved, total_target, total_achieved, profiles!weekly_target_matrix_user_id_fkey(full_name, email)')
        .eq('period_start', startStr)
        .eq('period_end', endStr);

      if (error) throw error;

      const transformed = (data || []).map((item: any) => ({
        id: item.id,
        user_id: item.user_id,
        profile: item.profiles,
        period_start: item.period_start,
        period_end: item.period_end,
        matrix_name: item.matrix_name,
        is_current: item.is_current,
        daily_achieved: item.daily_achieved || {},
        total_target: Number(item.total_target) || 0,
        total_achieved: Number(item.total_achieved) || 0,
      }));

      setMatrixData(transformed);
      setHasChanges(false);
      setLocalData({});
      loadedPeriodRef.current = periodKey;
    } catch (err) {
      console.error('Load matrix error:', err);
      toast.error('Failed to load targets');
    } finally {
      setLoading(false);
    }
  };

  // Initial load - runs once
  useEffect(() => {
    const init = async () => {
      try {
        if (hasRole('admin')) {
          const { data } = await supabase.from('profiles').select('*').eq('is_active', true);
          setProfiles((data as Profile[]) || []);

          const { data: matrices } = await supabase
            .from('weekly_target_matrix')
            .select('id, matrix_name, period_start, period_end, is_current')
            .order('period_start', { ascending: false });

          if (matrices && matrices.length > 0) {
            const uniqueMatrices: WeeklyMatrix[] = [];
            const seen = new Set<string>();
            (matrices as WeeklyMatrix[]).forEach(m => {
              const key = `${m.period_start}_${m.period_end}`;
              if (!seen.has(key)) {
                seen.add(key);
                uniqueMatrices.push(m);
              }
            });
            setSavedMatrices(uniqueMatrices);

            const today = new Date();
            let matrixToLoad = uniqueMatrices.find(m => {
              const mStart = parseISO(m.period_start);
              const mEnd = parseISO(m.period_end);
              return today >= mStart && today <= mEnd;
            });

            if (!matrixToLoad && uniqueMatrices.length > 0) {
              matrixToLoad = uniqueMatrices[0];
            }

            if (matrixToLoad) {
              const period = {
                start: parseISO(matrixToLoad.period_start),
                end: parseISO(matrixToLoad.period_end),
                name: matrixToLoad.matrix_name,
              };
              setActivePeriod(period);
              await loadMatrixData(period);
            }
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle explicit period change from user actions
  const handleLoadMatrix = async (matrix: WeeklyMatrix) => {
    const period = {
      start: parseISO(matrix.period_start),
      end: parseISO(matrix.period_end),
      name: matrix.matrix_name,
    };
    setActivePeriod(period);
    setShowMatrixSelector(false);
    await loadMatrixData(period, true);
  };

  // Generate matrix for all employees
  const handleGenerateMatrix = async () => {
    if (!startDate || !endDate) {
      toast.error('Please select start and end dates');
      return;
    }

    const start = parseISO(startDate);
    const end = parseISO(endDate);

    if (start > end) {
      toast.error('Start date must be before end date');
      return;
    }

    setLoading(true);
    try {
      const startStr = format(start, 'yyyy-MM-dd');
      const endStr = format(end, 'yyyy-MM-dd');
      const name = matrixName || generateMatrixName(start, end);

      const { data: existing } = await supabase
        .from('weekly_target_matrix')
        .select('id, matrix_name')
        .eq('period_start', startStr)
        .eq('period_end', endStr)
        .limit(1);

      if (existing && existing.length > 0) {
        const period = { start, end, name: (existing[0] as any).matrix_name || name };
        setActivePeriod(period);
        setShowDatePicker(false);
        await loadMatrixData(period, true);
        toast.success('Loaded existing target matrix');
        return;
      }

      const dates = generateDateRange(start, end);
      const emptyDailyData: Record<string, number> = {};
      dates.forEach(d => {
        emptyDailyData[format(d, 'yyyy-MM-dd')] = 0;
      });

      const matrixEntries = profiles.map(p => ({
        user_id: p.id,
        period_start: startStr,
        period_end: endStr,
        matrix_name: name,
        is_current: false,
        daily_achieved: emptyDailyData,
        total_target: 0,
        total_achieved: 0,
        created_by: profile?.id,
      }));

      const { error } = await supabase.from('weekly_target_matrix').insert(matrixEntries);

      if (error) throw error;

      const { data: matrices } = await supabase
        .from('weekly_target_matrix')
        .select('id, matrix_name, period_start, period_end, is_current')
        .order('period_start', { ascending: false });

      if (matrices) {
        const uniqueMatrices: WeeklyMatrix[] = [];
        const seen = new Set<string>();
        (matrices as WeeklyMatrix[]).forEach(m => {
          const key = `${m.period_start}_${m.period_end}`;
          if (!seen.has(key)) {
            seen.add(key);
            uniqueMatrices.push(m);
          }
        });
        setSavedMatrices(uniqueMatrices);
      }

      const period = { start, end, name };
      setActivePeriod(period);
      setShowDatePicker(false);
      await loadMatrixData(period, true);
      toast.success(`Created target matrix for ${profiles.length} employees`);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Failed to create matrix');
    } finally {
      setLoading(false);
    }
  };

  // Update local state on change
  const handleLocalChange = (matrixId: string, dateStr: string, value: number) => {
    setLocalData(prev => {
      const existing = prev[matrixId] || { daily_achieved: {}, total_target: 0 };
      return {
        ...prev,
        [matrixId]: {
          ...existing,
          daily_achieved: { ...existing.daily_achieved, [dateStr]: value },
        },
      };
    });
    setHasChanges(true);
  };

  // Update local weekly target
  const handleWeeklyTargetChange = (matrixId: string, value: number) => {
    setLocalData(prev => {
      const existing = prev[matrixId] || { daily_achieved: {}, total_target: 0 };
      return {
        ...prev,
        [matrixId]: { ...existing, total_target: value },
      };
    });
    setHasChanges(true);
  };

  // Save all changes
  const handleSaveAll = async () => {
    if (!hasChanges) return;

    setSaving(true);
    try {
      const modifiedIds = Object.keys(localData);

      await Promise.all(modifiedIds.map(async (matrixId) => {
        const localChanges = localData[matrixId];
        const matrix = matrixData.find(m => m.id === matrixId);
        if (!matrix) return;

        const updatedDailyAchieved = { ...matrix.daily_achieved, ...localChanges.daily_achieved };
        const newTotalAchieved = Object.values(updatedDailyAchieved).reduce((s: number, v: any) => s + (Number(v) || 0), 0);
        const newTotalTarget = localChanges.total_target ?? matrix.total_target;

        const { error } = await supabase
          .from('weekly_target_matrix')
          .update({
            daily_achieved: updatedDailyAchieved,
            total_achieved: newTotalAchieved,
            total_target: newTotalTarget,
            updated_at: new Date().toISOString(),
          })
          .eq('id', matrixId);

        if (error) throw error;
      }));

      setMatrixData(prev => prev.map(m => {
        const localChanges = localData[m.id];
        if (localChanges) {
          const updatedDailyAchieved = { ...m.daily_achieved, ...localChanges.daily_achieved };
          const newTotalAchieved = Object.values(updatedDailyAchieved).reduce((s: number, v: any) => s + (Number(v) || 0), 0);
          return {
            ...m,
            daily_achieved: updatedDailyAchieved,
            total_achieved: newTotalAchieved,
            total_target: localChanges.total_target ?? m.total_target,
          };
        }
        return m;
      }));

      setLocalData({});
      setHasChanges(false);
      toast.success('All changes saved successfully');
    } catch (err: any) {
      console.error('Save error:', err);
      toast.error(err.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  // Delete matrix
  const handleDeleteMatrix = async () => {
    if (!activePeriod || !confirm('Delete this entire target matrix?')) return;

    try {
      const startStr = format(activePeriod.start, 'yyyy-MM-dd');
      const endStr = format(activePeriod.end, 'yyyy-MM-dd');

      const { error } = await supabase
        .from('weekly_target_matrix')
        .delete()
        .eq('period_start', startStr)
        .eq('period_end', endStr);

      if (error) throw error;

      setSavedMatrices(prev => prev.filter(m => !(m.period_start === startStr && m.period_end === endStr)));
      setMatrixData([]);
      setActivePeriod(null);
      setLocalData({});
      setHasChanges(false);
      loadedPeriodRef.current = null;
      toast.success('Matrix deleted');
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete');
    }
  };

  // Navigate to previous/next period
  const navigatePeriod = async (direction: 'prev' | 'next') => {
    if (!activePeriod) return;
    const offset = direction === 'prev' ? -dateRange.length : dateRange.length;
    const newStart = addDays(activePeriod.start, offset);
    const newEnd = addDays(activePeriod.end, offset);
    const newPeriod = {
      start: newStart,
      end: newEnd,
      name: generateMatrixName(newStart, newEnd),
    };
    setStartDate(format(newStart, 'yyyy-MM-dd'));
    setEndDate(format(newEnd, 'yyyy-MM-dd'));
    setActivePeriod(newPeriod);
    await loadMatrixData(newPeriod, true);
  };

  // Get display value for a cell
  const getCellDisplayValue = (matrix: DailyTargetMatrix, dateStr: string): number => {
    if (localData[matrix.id]?.daily_achieved[dateStr] !== undefined) {
      return localData[matrix.id].daily_achieved[dateStr];
    }
    return matrix.daily_achieved[dateStr] || 0;
  };

  // Get display value for weekly target
  const getWeeklyTargetDisplayValue = (matrix: DailyTargetMatrix): number => {
    if (localData[matrix.id]?.total_target !== undefined) {
      return localData[matrix.id].total_target;
    }
    return matrix.total_target || 0;
  };

  // Calculate display totals
  const getDisplayTotals = (matrix: DailyTargetMatrix) => {
    const mergedDaily = { ...matrix.daily_achieved, ...(localData[matrix.id]?.daily_achieved || {}) };
    const totalAchieved = Object.values(mergedDaily).reduce((s: number, v: any) => s + (Number(v) || 0), 0);
    const totalTarget = localData[matrix.id]?.total_target ?? matrix.total_target;
    return { totalAchieved, totalTarget };
  };

  // Calculate grand totals
  const calculateGrandTotals = () => {
    let totalTarget = 0;
    let totalAchieved = 0;
    matrixData.forEach(m => {
      const totals = getDisplayTotals(m);
      totalTarget += totals.totalTarget;
      totalAchieved += totals.totalAchieved;
    });
    return { grandTotalTarget: totalTarget, grandTotalAchieved: totalAchieved, avgAchievement: percentage(totalAchieved, totalTarget) };
  };

  const { grandTotalTarget, grandTotalAchieved, avgAchievement } = calculateGrandTotals();

  if (!hasRole('admin')) {
    return (
      <div className="card p-8 text-center">
        <p className="text-secondary">Only admins can manage weekly targets</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* Matrix Selector Dropdown */}
          {savedMatrices.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowMatrixSelector(!showMatrixSelector)}
                className="flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg"
                style={{ background: 'rgb(var(--bg-elevated))', border: '1px solid rgb(var(--border-default))' }}
              >
                <Calendar className="w-3.5 h-3.5 text-secondary" />
                <span className="font-medium text-primary">{activePeriod?.name || 'Select Week'}</span>
                <ChevronDown className="w-3.5 h-3.5 text-secondary" />
              </button>

              {showMatrixSelector && (
                <div className="absolute top-full left-0 mt-1 w-64 rounded-lg shadow-lg z-50 py-1" style={{ background: 'rgb(var(--bg-elevated))', border: '1px solid rgb(var(--border-default))' }}>
                  <div className="px-3 py-2 text-[10px] font-semibold text-muted uppercase tracking-wider">Saved Weekly Targets</div>
                  {savedMatrices.map((matrix) => (
                    <button
                      key={matrix.id}
                      onClick={() => handleLoadMatrix(matrix)}
                      className={cn(
                        'w-full px-3 py-2 text-left text-xs hover:bg-[rgb(var(--bg-default))]',
                        activePeriod?.start && format(activePeriod.start, 'yyyy-MM-dd') === matrix.period_start && 'bg-[rgb(var(--primary)/0.1)]'
                      )}
                    >
                      <div className="font-medium text-primary">{matrix.matrix_name}</div>
                      <div className="text-muted text-[10px]">
                        {format(parseISO(matrix.period_start), 'dd MMM')} - {format(parseISO(matrix.period_end), 'dd MMM yyyy')}
                      </div>
                    </button>
                  ))}
                  <div className="border-t my-1" style={{ borderColor: 'rgb(var(--border-default))' }} />
                  <button onClick={() => { setShowMatrixSelector(false); setShowDatePicker(true); }} className="w-full px-3 py-2 text-left text-xs text-primary hover:bg-[rgb(var(--bg-default))] flex items-center gap-2">
                    <Plus className="w-3.5 h-3.5" />Create New Week
                  </button>
                </div>
              )}
            </div>
          )}

          <div>
            <h1 className="text-xl font-bold text-primary">Weekly Target Matrix</h1>
            <p className="text-secondary text-xs mt-0.5">
              {activePeriod ? `${format(activePeriod.start, 'dd MMM yyyy')} - ${format(activePeriod.end, 'dd MMM yyyy')}` : 'Select a week or create new target matrix'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Save Button */}
          {activePeriod && matrixData.length > 0 && (
            <button onClick={handleSaveAll} disabled={!hasChanges || saving} className={cn('px-3 py-1.5 text-xs rounded-lg flex items-center gap-1.5', hasChanges ? 'bg-success text-white hover:opacity-90' : 'bg-success/20 text-success cursor-default')}>
              {saving ? <><Spinner size="sm" /> Saving...</> : hasChanges ? <><Save className="w-3.5 h-3.5" /> Save All</> : <><Check className="w-3.5 h-3.5" /> Saved</>}
            </button>
          )}

          <button onClick={() => setShowDatePicker(true)} className="btn-primary px-2.5 py-1.5 text-xs flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" />
            {savedMatrices.length === 0 ? 'Create Target Matrix' : 'New Week'}
          </button>

          {activePeriod && (
            <>
              <button onClick={() => navigatePeriod('prev')} className="btn-secondary p-1.5"><ChevronLeft className="w-4 h-4" /></button>
              <button onClick={() => navigatePeriod('next')} className="btn-secondary p-1.5"><ChevronRight className="w-4 h-4" /></button>
              <div className="w-px h-5 mx-1" style={{ background: 'rgb(var(--border-default))' }} />
              <button onClick={handleDeleteMatrix} className="px-2.5 py-1.5 text-xs rounded-lg flex items-center gap-1" style={{ background: 'rgb(var(--error) / 0.15)', color: 'rgb(var(--error))' }}>
                <Trash2 className="w-3.5 h-3.5" />Delete
              </button>
            </>
          )}
        </div>
      </div>

      {/* Unsaved Changes Warning */}
      {hasChanges && (
        <div className="px-3 py-2 rounded-lg flex items-center gap-2" style={{ background: 'rgb(var(--warning) / 0.1)', color: 'rgb(var(--warning))' }}>
          <div className="w-2 h-2 rounded-full bg-warning animate-pulse" />
          <span className="text-xs font-medium">You have unsaved changes. Click "Save All" to persist.</span>
        </div>
      )}

      {/* Summary Stats */}
      {activePeriod && matrixData.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          <div className="card p-3"><p className="text-[10px] text-muted uppercase tracking-wider">Total Target</p><p className="text-lg font-bold text-primary">{formatINRShort(grandTotalTarget)}</p></div>
          <div className="card p-3"><p className="text-[10px] text-muted uppercase tracking-wider">Total Revenue</p><p className="text-lg font-bold" style={{ color: 'rgb(var(--success))' }}>{formatINRShort(grandTotalAchieved)}</p></div>
          <div className="card p-3"><p className="text-[10px] text-muted uppercase tracking-wider">Achievement</p><p className={cn('text-lg font-bold', avgAchievement >= 100 ? 'text-success' : avgAchievement >= 75 ? 'text-warning' : 'text-error')}>{avgAchievement}%</p></div>
          <div className="card p-3"><p className="text-[10px] text-muted uppercase tracking-wider">Employees</p><p className="text-lg font-bold text-primary">{matrixData.length}</p></div>
        </div>
      )}

      {/* Loading State */}
      {loading && <div className="flex items-center justify-center py-12"><Spinner size="lg" /></div>}

      {/* Empty State */}
      {!loading && !activePeriod && (
        <div className="card p-12 text-center">
          <Calendar className="w-16 h-16 mx-auto mb-4 text-muted" />
          <h3 className="text-lg font-semibold text-primary mb-2">No Target Matrix</h3>
          <p className="text-secondary text-sm mb-4">Create a weekly target matrix for all employees</p>
          <button onClick={() => setShowDatePicker(true)} className="btn-primary px-4 py-2"><Plus className="w-4 h-4 mr-2" />Create Target Matrix</button>
        </div>
      )}

      {/* No Data for Period */}
      {!loading && activePeriod && matrixData.length === 0 && (
        <div className="card p-12 text-center">
          <Calendar className="w-16 h-16 mx-auto mb-4 text-muted" />
          <h3 className="text-lg font-semibold text-primary mb-2">No Data for This Period</h3>
          <p className="text-secondary text-sm mb-4">There&apos;s no target matrix for {format(activePeriod.start, 'dd MMM')} - {format(activePeriod.end, 'dd MMM yyyy')}</p>
          <button onClick={() => setShowDatePicker(true)} className="btn-primary px-4 py-2"><Plus className="w-4 h-4 mr-2" />Create for This Period</button>
        </div>
      )}

      {/* Matrix Table */}
      {!loading && activePeriod && matrixData.length > 0 && (
        <div className="table-container overflow-hidden">
          <div className="overflow-x-auto" style={{ maxWidth: '100%' }}>
            <table className="w-full text-sm" style={{ minWidth: `${200 + dateRange.length * 100}px` }}>
              <thead className="table-header">
                <tr>
                  <th className="sticky left-0 z-20 px-3 py-2 text-xs font-semibold text-secondary uppercase tracking-wider text-left" style={{ background: 'rgb(var(--bg-elevated))', minWidth: '150px' }}>Employee</th>
                  {dateRange.map((date) => (
                    <th key={date.toISOString()} className={cn('px-2 py-2 text-xs font-semibold uppercase tracking-wider text-center whitespace-nowrap', isWeekend(date) && 'bg-[rgb(var(--warning)/0.1)]')} style={{ minWidth: '100px' }}>
                      <span className={isWeekend(date) ? 'text-warning' : 'text-secondary'}>{formatDateHeader(date)}</span>
                    </th>
                  ))}
                  <th className="px-3 py-2 text-xs font-semibold text-secondary uppercase tracking-wider text-right sticky right-28 z-10" style={{ background: 'rgb(var(--bg-elevated))', minWidth: '100px' }}>Revenue</th>
                  <th className="px-3 py-2 text-xs font-semibold text-secondary uppercase tracking-wider text-right sticky right-0 z-10" style={{ background: 'rgb(var(--bg-elevated))', minWidth: '150px' }}>Weekly Target / %</th>
                </tr>
              </thead>
              <tbody>
                {matrixData.map((matrix, idx) => {
                  const empName = (matrix.profile as any)?.full_name || 'Unknown';
                  const { totalAchieved, totalTarget } = getDisplayTotals(matrix);
                  const empAchievement = percentage(totalAchieved, totalTarget);

                  return (
                    <tr key={matrix.id} className={cn('table-row', idx % 2 === 0 && 'table-row-zebra')}>
                      <td className="sticky left-0 z-10 px-3 py-2 font-medium text-primary truncate" style={{ background: 'inherit', maxWidth: '150px' }}>{empName}</td>

                      {dateRange.map((date) => {
                        const dateStr = format(date, 'yyyy-MM-dd');
                        const achievedVal = getCellDisplayValue(matrix, dateStr);
                        const isWeekendDay = isWeekend(date);

                        return (
                          <td key={dateStr} className={cn('px-2 py-2 text-center', isWeekendDay && 'bg-[rgb(var(--warning)/0.05)]')}>
                            <input
                              type="number"
                              step="any"
                              value={achievedVal || ''}
                              onChange={(e) => handleLocalChange(matrix.id, dateStr, parseFloat(e.target.value) || 0)}
                              placeholder="0"
                              className="w-full px-1.5 py-1.5 text-xs rounded text-center focus:outline-none focus:ring-2 focus:ring-success/50"
                              style={{ background: 'rgb(var(--success) / 0.1)', border: '1px solid rgb(var(--success) / 0.2)', color: 'rgb(var(--success))' }}
                            />
                          </td>
                        );
                      })}

                      <td className="sticky right-28 px-3 py-2 text-right font-semibold" style={{ background: 'inherit' }}>
                        <span style={{ color: 'rgb(var(--success))' }}>{formatINRShort(totalAchieved)}</span>
                      </td>

                      <td className="sticky right-0 px-3 py-2 text-right" style={{ background: 'inherit' }}>
                        <div className="space-y-1.5">
                          <input
                            type="number"
                            step="any"
                            value={getWeeklyTargetDisplayValue(matrix) || ''}
                            onChange={(e) => handleWeeklyTargetChange(matrix.id, parseFloat(e.target.value) || 0)}
                            placeholder="Target"
                            className="w-full px-2 py-1 text-xs rounded text-right focus:outline-none focus:ring-2 focus:ring-primary/30"
                            style={{ background: 'rgb(var(--bg-elevated))', border: '1px solid rgb(var(--border-default))', color: 'rgb(var(--text-primary))' }}
                          />
                          <div className="flex items-center gap-1">
                            <div className="flex-1 h-1.5 rounded-full" style={{ background: 'rgb(var(--bg-elevated))' }}>
                              <div className="h-1.5 rounded-full transition-all" style={{ width: `${Math.min(empAchievement, 100)}%`, background: empAchievement >= 100 ? 'rgb(var(--success))' : empAchievement >= 75 ? 'rgb(var(--warning))' : 'rgb(var(--error))' }} />
                            </div>
                            <span className={cn('text-xs font-semibold w-10', empAchievement >= 100 ? 'text-success' : empAchievement >= 75 ? 'text-warning' : 'text-error')}>{empAchievement}%</span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {/* Summary Row */}
                <tr className="sticky bottom-0" style={{ background: 'rgb(var(--bg-elevated))', borderTop: '2px solid rgb(var(--border-accent))' }}>
                  <td className="sticky left-0 z-10 px-3 py-2 font-bold text-primary" style={{ background: 'inherit' }}>TOTAL</td>
                  {dateRange.map((date) => {
                    const dateStr = format(date, 'yyyy-MM-dd');
                    const dayAchieved = matrixData.reduce((s, m) => s + (localData[m.id]?.daily_achieved[dateStr] ?? m.daily_achieved[dateStr] ?? 0), 0);
                    return <td key={dateStr} className="px-2 py-2 text-center"><div className="text-xs font-semibold" style={{ color: 'rgb(var(--success))' }}>{formatINRShort(dayAchieved)}</div></td>;
                  })}
                  <td className="sticky right-28 px-3 py-2 text-right font-bold" style={{ background: 'inherit', color: 'rgb(var(--success))' }}>{formatINRShort(grandTotalAchieved)}</td>
                  <td className="sticky right-0 px-3 py-2 text-right" style={{ background: 'inherit' }}>
                    <div className="space-y-0.5">
                      <div className="text-xs font-semibold text-primary">{formatINRShort(grandTotalTarget)}</div>
                      <div className={cn('text-xs font-bold', avgAchievement >= 100 ? 'text-success' : avgAchievement >= 75 ? 'text-warning' : 'text-error')}>{avgAchievement}%</div>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Date Picker Modal */}
      {showDatePicker && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowDatePicker(false)}>
          <div className="modal-content space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-primary">Create Target Matrix</h2>
              <button onClick={() => setShowDatePicker(false)} className="text-secondary hover:text-primary"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-xs text-muted">Select start and end dates. A matrix will be generated for all active employees.</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">Matrix Name (for easy identification)</label>
                <input type="text" value={matrixName} onChange={(e) => setMatrixName(e.target.value)} placeholder={generateMatrixName(parseISO(startDate), parseISO(endDate))} className="input" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-secondary mb-1">Start Date</label>
                  <input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setMatrixName(''); }} className="input" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-secondary mb-1">End Date</label>
                  <input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setMatrixName(''); }} className="input" />
                </div>
              </div>
            </div>
            {startDate && endDate && (
              <div className="text-xs text-secondary p-3 rounded-lg" style={{ background: 'rgb(var(--bg-elevated))' }}>
                <div className="font-medium text-primary mb-1">{matrixName || generateMatrixName(parseISO(startDate), parseISO(endDate))}</div>
                Period: {format(parseISO(startDate), 'dd MMM yyyy')} - {format(parseISO(endDate), 'dd MMM yyyy')}<br />
                Days: {generateDateRange(parseISO(startDate), parseISO(endDate)).length} | Employees: {profiles.length}
              </div>
            )}
            <button onClick={handleGenerateMatrix} disabled={loading} className="btn-primary w-full py-2.5 text-sm">{loading ? 'Creating...' : `Create Matrix for ${profiles.length} Employees`}</button>
          </div>
        </div>
      )}

      {/* Click outside to close matrix selector */}
      {showMatrixSelector && <div className="fixed inset-0 z-40" onClick={() => setShowMatrixSelector(false)} />}
    </div>
  );
}
