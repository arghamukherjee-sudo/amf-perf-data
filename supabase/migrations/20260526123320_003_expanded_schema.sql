/*
  # AMF Performance CRM - Expanded Schema

  1. New Tables
    - `lead_assignments` - Lead tracking and assignment
      - id (uuid, PK)
      - user_id (uuid, FK -> profiles)
      - team_id (uuid, FK -> teams, nullable)
      - lead_name (text)
      - lead_email (text, nullable)
      - lead_phone (text, nullable)
      - lead_source (text: 'website' | 'referral' | 'cold_call' | 'social_media' | 'event' | 'other')
      - status (text: 'new' | 'contacted' | 'qualified' | 'proposal' | 'negotiation' | 'won' | 'lost')
      - estimated_value (numeric)
      - actual_value (numeric)
      - probability (numeric, 0-100)
      - billing_cycle_start (date)
      - billing_cycle_end (date)
      - notes (text, nullable)
      - created_at, updated_at (timestamps)

    - `weekly_targets` - Weekly target tracking
      - id (uuid, PK)
      - user_id (uuid, FK -> profiles)
      - team_id (uuid, FK -> teams, nullable)
      - week_start (date)
      - week_end (date)
      - metric_name (text)
      - target_value (numeric)
      - achieved_value (numeric, default 0)
      - created_at, updated_at (timestamps)

    - `monthly_targets` - Monthly target tracking (billing cycle based)
      - id (uuid, PK)
      - user_id (uuid, FK -> profiles, nullable)
      - team_id (uuid, FK -> teams, nullable)
      - billing_cycle_start (date)
      - billing_cycle_end (date)
      - metric_name (text)
      - target_value (numeric)
      - achieved_value (numeric, default 0)
      - category (text: 'revenue' | 'leads' | 'calls' | 'meetings' | 'conversions')
      - created_at, updated_at (timestamps)

    - `kpi_metrics` - KPI definitions and tracking
      - id (uuid, PK)
      - user_id (uuid, FK -> profiles, nullable)
      - team_id (uuid, FK -> teams, nullable)
      - billing_cycle_start (date)
      - billing_cycle_end (date)
      - metric_name (text)
      - metric_key (text - e.g., 'revenue_achieved', 'lead_conversion', 'attendance_rate')
      - target_value (numeric)
      - achieved_value (numeric, default 0)
      - unit (text: 'currency' | 'count' | 'percentage')
      - weight (numeric, 0-100, default 100 - for weighted KPI scoring)
      - created_at, updated_at (timestamps)

    - `billing_cycles` - Billing cycle management
      - id (uuid, PK)
      - cycle_start (date)
      - cycle_end (date)
      - label (text - e.g., "Apr 2026")
      - is_current (boolean, default false)
      - is_locked (boolean, default false - locks editing when finalized)
      - notes (text, nullable)
      - created_at, updated_at (timestamps)

    - `notifications` - In-app notifications
      - id (uuid, PK)
      - user_id (uuid, FK -> profiles)
      - title (text)
      - message (text)
      - type (text: 'info' | 'success' | 'warning' | 'error')
      - is_read (boolean, default false)
      - related_entity_type (text, nullable - e.g., 'revenue', 'attendance')
      - related_entity_id (uuid, nullable)
      - created_at (timestamp)

    - `reports` - Saved report configurations
      - id (uuid, PK)
      - created_by (uuid, FK -> profiles)
      - report_type (text: 'revenue' | 'attendance' | 'kpi' | 'performance' | 'leads')
      - title (text)
      - description (text, nullable)
      - config (jsonb - filters, date ranges, etc.)
      - billing_cycle_start (date, nullable)
      - billing_cycle_end (date, nullable)
      - is_scheduled (boolean, default false)
      - schedule_frequency (text, nullable: 'daily' | 'weekly' | 'monthly')
      - created_at, updated_at (timestamps)

  2. Modified Tables
    - `attendance_entries` renamed concept to `attendance` (keeping existing table name for compatibility)
    - `revenue_entries` stays as-is (keeping existing table name)
    - `team_members` already exists from initial schema

  3. Security
    - RLS enabled on ALL new tables
    - Policies follow the same pattern:
      - Team members: read/write own data only
      - Admins: read/write all data in their scope
      - Super admins: full access

  4. Important Notes
    - Billing cycle is 26th of current month to 25th of next month
    - All timestamps use timestamptz with default now()
    - UUIDs generated with gen_random_uuid()
*/

-- Lead Assignments
CREATE TABLE IF NOT EXISTS lead_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  team_id uuid REFERENCES teams(id) ON DELETE SET NULL,
  lead_name text NOT NULL DEFAULT '',
  lead_email text DEFAULT '',
  lead_phone text DEFAULT '',
  lead_source text NOT NULL DEFAULT 'other' CHECK (lead_source IN ('website', 'referral', 'cold_call', 'social_media', 'event', 'other')),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost')),
  estimated_value numeric NOT NULL DEFAULT 0,
  actual_value numeric NOT NULL DEFAULT 0,
  probability numeric NOT NULL DEFAULT 0 CHECK (probability >= 0 AND probability <= 100),
  billing_cycle_start date NOT NULL,
  billing_cycle_end date NOT NULL,
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Weekly Targets
CREATE TABLE IF NOT EXISTS weekly_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  team_id uuid REFERENCES teams(id) ON DELETE SET NULL,
  week_start date NOT NULL,
  week_end date NOT NULL,
  metric_name text NOT NULL,
  target_value numeric NOT NULL DEFAULT 0,
  achieved_value numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Monthly Targets
CREATE TABLE IF NOT EXISTS monthly_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  team_id uuid REFERENCES teams(id) ON DELETE SET NULL,
  billing_cycle_start date NOT NULL,
  billing_cycle_end date NOT NULL,
  metric_name text NOT NULL,
  target_value numeric NOT NULL DEFAULT 0,
  achieved_value numeric NOT NULL DEFAULT 0,
  category text NOT NULL DEFAULT 'revenue' CHECK (category IN ('revenue', 'leads', 'calls', 'meetings', 'conversions')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- KPI Metrics
CREATE TABLE IF NOT EXISTS kpi_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  team_id uuid REFERENCES teams(id) ON DELETE SET NULL,
  billing_cycle_start date NOT NULL,
  billing_cycle_end date NOT NULL,
  metric_name text NOT NULL,
  metric_key text NOT NULL DEFAULT '',
  target_value numeric NOT NULL DEFAULT 0,
  achieved_value numeric NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT 'count' CHECK (unit IN ('currency', 'count', 'percentage')),
  weight numeric NOT NULL DEFAULT 100 CHECK (weight >= 0 AND weight <= 100),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Billing Cycles
CREATE TABLE IF NOT EXISTS billing_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_start date NOT NULL,
  cycle_end date NOT NULL,
  label text NOT NULL,
  is_current boolean NOT NULL DEFAULT false,
  is_locked boolean NOT NULL DEFAULT false,
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  message text NOT NULL DEFAULT '',
  type text NOT NULL DEFAULT 'info' CHECK (type IN ('info', 'success', 'warning', 'error')),
  is_read boolean NOT NULL DEFAULT false,
  related_entity_type text DEFAULT '',
  related_entity_id uuid DEFAULT NULL,
  created_at timestamptz DEFAULT now()
);

-- Reports (saved configurations)
CREATE TABLE IF NOT EXISTS reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  report_type text NOT NULL DEFAULT 'revenue' CHECK (report_type IN ('revenue', 'attendance', 'kpi', 'performance', 'leads')),
  title text NOT NULL,
  description text DEFAULT '',
  config jsonb DEFAULT '{}',
  billing_cycle_start date DEFAULT NULL,
  billing_cycle_end date DEFAULT NULL,
  is_scheduled boolean NOT NULL DEFAULT false,
  schedule_frequency text DEFAULT NULL CHECK (schedule_frequency IS NULL OR schedule_frequency IN ('daily', 'weekly', 'monthly')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS on all new tables
ALTER TABLE lead_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE kpi_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- =====================
-- LEAD ASSIGNMENTS POLICIES
-- =====================
CREATE POLICY "Users can read own leads"
  ON lead_assignments FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can read all leads"
  ON lead_assignments FOR SELECT
  TO authenticated
  USING (is_admin_or_above());

CREATE POLICY "Users can insert own leads"
  ON lead_assignments FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can insert any leads"
  ON lead_assignments FOR INSERT
  TO authenticated
  WITH CHECK (is_admin_or_above());

CREATE POLICY "Users can update own leads"
  ON lead_assignments FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can update any leads"
  ON lead_assignments FOR UPDATE
  TO authenticated
  USING (is_admin_or_above())
  WITH CHECK (is_admin_or_above());

CREATE POLICY "Users can delete own leads"
  ON lead_assignments FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can delete any leads"
  ON lead_assignments FOR DELETE
  TO authenticated
  USING (is_admin_or_above());

-- =====================
-- WEEKLY TARGETS POLICIES
-- =====================
CREATE POLICY "Users can read own weekly targets"
  ON weekly_targets FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can read all weekly targets"
  ON weekly_targets FOR SELECT
  TO authenticated
  USING (is_admin_or_above());

CREATE POLICY "Admins can manage weekly targets"
  ON weekly_targets FOR INSERT
  TO authenticated
  WITH CHECK (is_admin_or_above());

CREATE POLICY "Admins can update weekly targets"
  ON weekly_targets FOR UPDATE
  TO authenticated
  USING (is_admin_or_above())
  WITH CHECK (is_admin_or_above());

CREATE POLICY "Admins can delete weekly targets"
  ON weekly_targets FOR DELETE
  TO authenticated
  USING (is_admin_or_above());

-- =====================
-- MONTHLY TARGETS POLICIES
-- =====================
CREATE POLICY "Users can read own monthly targets"
  ON monthly_targets FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can read all monthly targets"
  ON monthly_targets FOR SELECT
  TO authenticated
  USING (is_admin_or_above());

CREATE POLICY "Admins can manage monthly targets"
  ON monthly_targets FOR INSERT
  TO authenticated
  WITH CHECK (is_admin_or_above());

CREATE POLICY "Admins can update monthly targets"
  ON monthly_targets FOR UPDATE
  TO authenticated
  USING (is_admin_or_above())
  WITH CHECK (is_admin_or_above());

CREATE POLICY "Admins can delete monthly targets"
  ON monthly_targets FOR DELETE
  TO authenticated
  USING (is_admin_or_above());

-- =====================
-- KPI METRICS POLICIES
-- =====================
CREATE POLICY "Users can read own KPIs"
  ON kpi_metrics FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));

CREATE POLICY "Admins can read all KPIs"
  ON kpi_metrics FOR SELECT
  TO authenticated
  USING (is_admin_or_above());

CREATE POLICY "Admins can manage KPIs"
  ON kpi_metrics FOR INSERT
  TO authenticated
  WITH CHECK (is_admin_or_above());

CREATE POLICY "Admins can update KPIs"
  ON kpi_metrics FOR UPDATE
  TO authenticated
  USING (is_admin_or_above())
  WITH CHECK (is_admin_or_above());

CREATE POLICY "Admins can delete KPIs"
  ON kpi_metrics FOR DELETE
  TO authenticated
  USING (is_admin_or_above());

-- =====================
-- BILLING CYCLES POLICIES
-- =====================
CREATE POLICY "Authenticated users can read billing cycles"
  ON billing_cycles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage billing cycles"
  ON billing_cycles FOR INSERT
  TO authenticated
  WITH CHECK (is_admin_or_above());

CREATE POLICY "Admins can update billing cycles"
  ON billing_cycles FOR UPDATE
  TO authenticated
  USING (is_admin_or_above())
  WITH CHECK (is_admin_or_above());

-- =====================
-- NOTIFICATIONS POLICIES
-- =====================
CREATE POLICY "Users can read own notifications"
  ON notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can insert notifications"
  ON notifications FOR INSERT
  TO authenticated
  WITH CHECK (is_admin_or_above());

-- =====================
-- REPORTS POLICIES
-- =====================
CREATE POLICY "Users can read own reports"
  ON reports FOR SELECT
  TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "Admins can read all reports"
  ON reports FOR SELECT
  TO authenticated
  USING (is_admin_or_above());

CREATE POLICY "Users can create reports"
  ON reports FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can update own reports"
  ON reports FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can delete own reports"
  ON reports FOR DELETE
  TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "Admins can delete any reports"
  ON reports FOR DELETE
  TO authenticated
  USING (is_admin_or_above());

-- Indexes
CREATE INDEX IF NOT EXISTS idx_leads_user ON lead_assignments(user_id, billing_cycle_start);
CREATE INDEX IF NOT EXISTS idx_leads_team ON lead_assignments(team_id, billing_cycle_start);
CREATE INDEX IF NOT EXISTS idx_leads_status ON lead_assignments(status);
CREATE INDEX IF NOT EXISTS idx_weekly_user ON weekly_targets(user_id, week_start);
CREATE INDEX IF NOT EXISTS idx_monthly_user ON monthly_targets(user_id, billing_cycle_start);
CREATE INDEX IF NOT EXISTS idx_kpi_user ON kpi_metrics(user_id, billing_cycle_start);
CREATE INDEX IF NOT EXISTS idx_kpi_key ON kpi_metrics(metric_key);
CREATE INDEX IF NOT EXISTS idx_billing_current ON billing_cycles(is_current);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_reports_type ON reports(report_type);

-- Triggers for updated_at
CREATE TRIGGER set_lead_assignments_updated_at BEFORE UPDATE ON lead_assignments FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_weekly_targets_updated_at BEFORE UPDATE ON weekly_targets FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_monthly_targets_updated_at BEFORE UPDATE ON monthly_targets FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_kpi_metrics_updated_at BEFORE UPDATE ON kpi_metrics FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_billing_cycles_updated_at BEFORE UPDATE ON billing_cycles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_reports_updated_at BEFORE UPDATE ON reports FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Seed billing cycles for the next 12 months
INSERT INTO billing_cycles (cycle_start, cycle_end, label, is_current)
SELECT
  d::date,
  (d + interval '1 month' - interval '1 day')::date,
  to_char(d::date, 'Mon YYYY'),
  d::date <= CURRENT_DATE AND (d + interval '1 month' - interval '1 day')::date >= CURRENT_DATE
FROM generate_series(
  date_trunc('month', CURRENT_DATE - interval '3 months') + interval '25 days',
  date_trunc('month', CURRENT_DATE + interval '8 months') + interval '25 days',
  interval '1 month'
) AS d
ON CONFLICT DO NOTHING;
