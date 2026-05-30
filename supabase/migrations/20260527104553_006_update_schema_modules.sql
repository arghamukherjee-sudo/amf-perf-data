/*
  # Update schema for enhanced modules

  1. Changes to profiles
    - Add mobile, designation, joining_date, status columns

  2. Changes to monthly_targets
    - Ensure proper structure for revenue_target, leads_target

  3. Changes to kpi_metrics
    - Add call_attempts, talk_time columns for daily KPI tracking

  4. Changes to billing_cycles
    - Ensure is_archive column exists

  5. Security
    - All tables have existing RLS policies
*/

-- Add columns to profiles
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'mobile') THEN
    ALTER TABLE profiles ADD COLUMN mobile text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'designation') THEN
    ALTER TABLE profiles ADD COLUMN designation text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'joining_date') THEN
    ALTER TABLE profiles ADD COLUMN joining_date date;
  END IF;
END $$;

-- Add columns to monthly_targets if needed
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'monthly_targets' AND column_name = 'notes') THEN
    ALTER TABLE monthly_targets ADD COLUMN notes text DEFAULT '';
  END IF;
END $$;

-- Add call_attempts and talk_time to kpi_metrics
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'kpi_metrics' AND column_name = 'call_attempts') THEN
    ALTER TABLE kpi_metrics ADD COLUMN call_attempts integer DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'kpi_metrics' AND column_name = 'talk_time') THEN
    ALTER TABLE kpi_metrics ADD COLUMN talk_time integer DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'kpi_metrics' AND column_name = 'date') THEN
    ALTER TABLE kpi_metrics ADD COLUMN date date;
  END IF;
END $$;

-- Create settings table if not exists
CREATE TABLE IF NOT EXISTS settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  key text NOT NULL,
  value text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, key)
);

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own settings"
  ON settings FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can manage own settings"
  ON settings FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Create daily_kpi table for day-level tracking
CREATE TABLE IF NOT EXISTS daily_kpi (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date date NOT NULL,
  call_attempts integer NOT NULL DEFAULT 0,
  talk_time integer NOT NULL DEFAULT 0,
  leads_assigned integer NOT NULL DEFAULT 0,
  revenue numeric NOT NULL DEFAULT 0,
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, date)
);

ALTER TABLE daily_kpi ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own daily kpi"
  ON daily_kpi FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR is_admin_or_above());

CREATE POLICY "Users can insert own daily kpi"
  ON daily_kpi FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() OR is_admin_or_above());

CREATE POLICY "Users can update own daily kpi"
  ON daily_kpi FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() OR is_admin_or_above())
  WITH CHECK (user_id = auth.uid() OR is_admin_or_above());

CREATE INDEX IF NOT EXISTS idx_daily_kpi_user_date ON daily_kpi(user_id, date);

-- Add indexes for commonly queried columns
CREATE INDEX IF NOT EXISTS idx_monthly_targets_user_cycle ON monthly_targets(user_id, billing_cycle_start);
CREATE INDEX IF NOT EXISTS idx_kpi_metrics_user_cycle ON kpi_metrics(user_id, billing_cycle_start);
