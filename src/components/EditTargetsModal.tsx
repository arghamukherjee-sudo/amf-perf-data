import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';
import { Save, X, TrendingUp } from 'lucide-react';

interface Target {
  user_id: string;
  full_name: string;
  target_value: number;
  category: string;
}

interface EditTargetsModalProps {
  cycleStart: string;
  cycleEnd: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function EditTargetsModal({ cycleStart, cycleEnd, onSuccess, onCancel }: EditTargetsModalProps) {
  const [targets, setTargets] = useState<Target[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadTargets();
  }, [cycleStart, cycleEnd]);

  const loadTargets = async () => {
    setLoading(true);
    try {
      // Get all active team members
      const { data: members } = await supabase
        .from('profiles')
        .select('id, full_name');

      // Get existing targets
      const { data: existingTargets } = await supabase
        .from('monthly_targets')
        .select('user_id, target_value, category')
        .eq('category', 'revenue')
        .eq('billing_cycle_start', cycleStart)
        .eq('billing_cycle_end', cycleEnd);

      const targetMap = new Map();
      existingTargets?.forEach(t => {
        targetMap.set(t.user_id, t.target_value);
      });

      const targetList: Target[] = members?.map(m => ({
        user_id: m.id,
        full_name: m.full_name || 'Unknown',
        target_value: targetMap.get(m.id) || 0,
        category: 'revenue'
      })) || [];

      setTargets(targetList);
    } catch (error) {
      console.error(error);
      toast.error('Failed to load targets');
    } finally {
      setLoading(false);
    }
  };

  const updateTarget = (userId: string, value: number) => {
    setTargets(prev => prev.map(t => 
      t.user_id === userId ? { ...t, target_value: value } : t
    ));
  };

  const saveAllTargets = async () => {
    setSaving(true);
    try {
      // Delete existing targets for this cycle
      await supabase
        .from('monthly_targets')
        .delete()
        .eq('category', 'revenue')
        .eq('billing_cycle_start', cycleStart)
        .eq('billing_cycle_end', cycleEnd);

      // Insert new targets
      const toInsert = targets
        .filter(t => t.target_value > 0)
        .map(t => ({
          user_id: t.user_id,
          category: 'revenue',
          metric_name: 'Revenue Target',
          target_value: t.target_value,
          achieved_value: 0,
          billing_cycle_start: cycleStart,
          billing_cycle_end: cycleEnd,
          weight: 100,
          created_at: new Date(),
          updated_at: new Date()
        }));

      if (toInsert.length > 0) {
        const { error } = await supabase
          .from('monthly_targets')
          .insert(toInsert);
        
        if (error) throw error;
      }

      toast.success(`Saved ${toInsert.length} targets`);
      onSuccess();
    } catch (error: any) {
      toast.error(error.message || 'Failed to save targets');
    } finally {
      setSaving(false);
    }
  };

  const totalTarget = targets.reduce((sum, t) => sum + t.target_value, 0);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
        <div className="card rounded-2xl p-8">
          <div className="text-center">Loading targets...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="card rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-card z-10">
          <div>
            <h2 className="text-lg font-bold text-primary flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Edit Revenue Targets
            </h2>
            <p className="text-xs text-muted mt-1">
              Cycle: {cycleStart} to {cycleEnd}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={saveAllTargets} disabled={saving} className="btn-primary flex items-center gap-2">
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save All'}
            </button>
            <button onClick={onCancel} className="btn-secondary p-2">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-4">
          {/* Summary Card */}
          <div className="bg-secondary rounded-lg p-4 mb-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-secondary">Total Target</span>
              <span className="text-2xl font-bold text-primary">
                ₹{totalTarget.toLocaleString('en-IN')}
              </span>
            </div>
          </div>

          {/* Targets Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary">
                <tr>
                  <th className="p-3 text-left text-xs font-semibold text-secondary uppercase">Team Member</th>
                  <th className="p-3 text-right text-xs font-semibold text-secondary uppercase">Target (₹)</th>
                </tr>
              </thead>
              <tbody>
                {targets.map((target) => (
                  <tr key={target.user_id} className="border-b border-border">
                    <td className="p-3 text-primary">{target.full_name}</td>
                    <td className="p-3 text-right">
                      <input
                        type="number"
                        value={target.target_value || ''}
                        onChange={(e) => updateTarget(target.user_id, parseInt(e.target.value) || 0)}
                        className="input w-40 px-3 py-2 text-right text-sm"
                        placeholder="Enter target"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-secondary">
                <tr>
                  <td className="p-3 font-semibold text-primary">Total</td>
                  <td className="p-3 text-right font-bold text-primary">
                    ₹{totalTarget.toLocaleString('en-IN')}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="mt-4 text-xs text-muted text-center">
            Tip: Set targets to ₹0 for members who shouldn't count toward the total
          </div>
        </div>
      </div>
    </div>
  );
}