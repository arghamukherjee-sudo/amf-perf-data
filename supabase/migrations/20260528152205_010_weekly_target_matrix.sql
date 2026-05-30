/*
  # Weekly Target Matrix Table

  1. Purpose
    - Store daily/weekly targets in a matrix format
    - Each record = one employee + one period (start/end date)
    - Daily targets stored as JSONB for flexibility

  2. New Table: weekly_target_matrix
    - id: UUID primary key
    - user_id: UUID (references profiles)
    - period_start: date
    - period_end: date
    - daily_targets: JSONB (stores { "YYYY-MM-DD": target_value })
    - daily_achieved: JSONB (stores { "YYYY-MM-DD": achieved_value })
    - total_target: numeric (auto-calculated)
    - total_achieved: numeric (auto-calculated)
    - created_by: UUID (admin who created)
    - created_at, updated_at: timestamps

  3. RLS Policies
    - Admins can CRUD all records
    - Team members can read/update their own records
*/

CREATE TABLE IF NOT EXISTS weekly_target_matrix (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  daily_targets jsonb NOT NULL DEFAULT '{}',
  daily_achieved jsonb NOT NULL DEFAULT '{}',
  total_target numeric NOT NULL DEFAULT 0,
  total_achieved numeric NOT NULL DEFAULT 0,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, period_start, period_end)
);

-- Enable RLS
ALTER TABLE weekly_target_matrix ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins can manage all weekly target matrix"
  ON weekly_target_matrix
  FOR ALL
  TO authenticated
  USING (is_admin_or_above())
  WITH CHECK (is_admin_or_above());

-- Team members can read their own
CREATE POLICY "Team members can read own weekly target matrix"
  ON weekly_target_matrix
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Team members can update their own achieved values
CREATE POLICY "Team members can update own weekly target matrix"
  ON weekly_target_matrix
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_weekly_target_matrix_user ON weekly_target_matrix(user_id);
CREATE INDEX IF NOT EXISTS idx_weekly_target_matrix_period ON weekly_target_matrix(period_start, period_end);