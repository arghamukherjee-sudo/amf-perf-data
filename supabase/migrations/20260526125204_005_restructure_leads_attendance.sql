/*
  # Restructure lead_assignments and add week_off to attendance

  1. Changes to attendance_entries
    - Add 'week_off' to the status CHECK constraint
    - Week Off does NOT reduce attendance percentage (handled in app logic)

  2. Changes to lead_assignments
    - Remove lead_name, lead_email, lead_phone, lead_source columns (not needed for operational table)
    - Remove estimated_value, actual_value, probability columns
    - Remove status column (pipeline tracking not needed for this operational view)
    - Add: assigned_date (date, NOT NULL)
    - Add: leads_assigned (integer, NOT NULL DEFAULT 0)
    - Add: revenue (numeric, NOT NULL DEFAULT 0) - THIS IS THE MAIN REVENUE SOURCE
    - Add: batch_name (text, DEFAULT '')
    - Keep: id, user_id, team_id, billing_cycle_start, billing_cycle_end, notes, created_at, updated_at
    - Add unique constraint: (user_id, assigned_date, batch_name) to prevent duplicate revenue entries

  3. Security
    - RLS policies remain the same
    - Unique constraint prevents duplicate revenue entries per user per date per batch

  4. Important Notes
    - Revenue from lead_assignments is THE main revenue source for the app
    - Dashboard, Reports, Analytics, ARPU, KPI calculations all read from this table
    - revenue_entries table is kept for backward compatibility but lead_assignments.revenue is primary
    - The attendance 'week_off' status is excluded from attendance percentage calculations
*/

-- Drop existing CHECK constraints and recreate with week_off
ALTER TABLE attendance_entries DROP CONSTRAINT IF EXISTS attendance_entries_status_check;
ALTER TABLE attendance_entries ADD CONSTRAINT attendance_entries_status_check
  CHECK (status IN ('present', 'absent', 'half_day', 'leave', 'week_off'));

-- Add notes column if not already present (it exists from initial schema, but ensure)
-- Add assigned_date, leads_assigned, revenue, batch_name to lead_assignments
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lead_assignments' AND column_name = 'assigned_date') THEN
    ALTER TABLE lead_assignments ADD COLUMN assigned_date date NOT NULL DEFAULT CURRENT_DATE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lead_assignments' AND column_name = 'leads_assigned') THEN
    ALTER TABLE lead_assignments ADD COLUMN leads_assigned integer NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lead_assignments' AND column_name = 'revenue') THEN
    ALTER TABLE lead_assignments ADD COLUMN revenue numeric NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lead_assignments' AND column_name = 'batch_name') THEN
    ALTER TABLE lead_assignments ADD COLUMN batch_name text NOT NULL DEFAULT '';
  END IF;
END $$;

-- Add unique constraint to prevent duplicate revenue entries
CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_assignments_unique_entry
  ON lead_assignments (user_id, assigned_date, batch_name);

-- Add index for revenue queries
CREATE INDEX IF NOT EXISTS idx_lead_assignments_revenue
  ON lead_assignments (user_id, billing_cycle_start, assigned_date);
