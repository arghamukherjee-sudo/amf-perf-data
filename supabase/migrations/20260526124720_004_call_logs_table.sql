/*
  # Add call_logs table for call tracking

  1. New Table
    - `call_logs`
      - id (uuid, PK)
      - user_id (uuid, FK -> profiles)
      - lead_id (uuid, FK -> lead_assignments, nullable)
      - call_type (text: 'outbound' | 'inbound')
      - duration_seconds (integer)
      - notes (text)
      - called_at (timestamptz)
      - created_at (timestamptz)

  2. Security
    - RLS enabled
    - Team members: read/write own calls
    - Admins: read all, manage all

  3. Important Notes
    - Duration stored in seconds for easy aggregation
    - Supports both inbound and outbound calls
*/

CREATE TABLE IF NOT EXISTS call_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES lead_assignments(id) ON DELETE SET NULL,
  call_type text NOT NULL DEFAULT 'outbound' CHECK (call_type IN ('outbound', 'inbound')),
  duration_seconds integer NOT NULL DEFAULT 0,
  notes text DEFAULT '',
  called_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE call_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own calls"
  ON call_logs FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can read all calls"
  ON call_logs FOR SELECT
  TO authenticated
  USING (is_admin_or_above());

CREATE POLICY "Users can insert own calls"
  ON call_logs FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can insert any calls"
  ON call_logs FOR INSERT
  TO authenticated
  WITH CHECK (is_admin_or_above());

CREATE POLICY "Users can update own calls"
  ON call_logs FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own calls"
  ON call_logs FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can delete any calls"
  ON call_logs FOR DELETE
  TO authenticated
  USING (is_admin_or_above());

CREATE INDEX IF NOT EXISTS idx_call_logs_user ON call_logs(user_id, called_at);
CREATE INDEX IF NOT EXISTS idx_call_logs_billing ON call_logs(user_id, called_at);
