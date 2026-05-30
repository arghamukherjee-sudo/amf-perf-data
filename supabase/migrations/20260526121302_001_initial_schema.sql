/*
  # AMF Performance CRM - Initial Schema

  1. New Tables
    - `profiles` - User profiles linked to auth.users, with role-based access
      - `id` (uuid, PK, references auth.users)
      - `email` (text, unique)
      - `full_name` (text)
      - `role` (text: 'super_admin' | 'admin' | 'team_member')
      - `is_active` (boolean)
      - `phone` (text, nullable)
      - `avatar_url` (text, nullable)
      - `created_at`, `updated_at` (timestamps)

    - `teams` - Team groupings
      - `id` (uuid, PK)
      - `name` (text, unique)
      - `description` (text)
      - `created_at`, `updated_at` (timestamps)

    - `team_members` - Junction table linking users to teams
      - `id` (uuid, PK)
      - `user_id` (uuid, FK -> profiles)
      - `team_id` (uuid, FK -> teams)
      - `joined_at` (timestamp)

    - `revenue_entries` - Revenue data per billing cycle
      - `id` (uuid, PK)
      - `user_id` (uuid, FK -> profiles)
      - `team_id` (uuid, FK -> teams)
      - `billing_cycle_start` (date)
      - `billing_cycle_end` (date)
      - `target_amount` (numeric)
      - `achieved_amount` (numeric)
      - `source` (text - e.g., 'new_business', 'renewal', 'upsell')
      - `notes` (text, nullable)
      - `created_at`, `updated_at` (timestamps)

    - `attendance_entries` - Attendance per billing cycle day
      - `id` (uuid, PK)
      - `user_id` (uuid, FK -> profiles)
      - `date` (date)
      - `status` (text: 'present' | 'absent' | 'half_day' | 'leave')
      - `check_in` (time, nullable)
      - `check_out` (time, nullable)
      - `notes` (text, nullable)
      - `created_at`, `updated_at` (timestamps)

    - `kpi_targets` - KPI targets per billing cycle
      - `id` (uuid, PK)
      - `user_id` (uuid, FK -> profiles, nullable - null means team-wide)
      - `team_id` (uuid, FK -> teams, nullable)
      - `billing_cycle_start` (date)
      - `billing_cycle_end` (date)
      - `metric_name` (text)
      - `target_value` (numeric)
      - `achieved_value` (numeric, default 0)
      - `created_at`, `updated_at` (timestamps)

    - `invitations` - User invite tracking
      - `id` (uuid, PK)
      - `email` (text)
      - `role` (text)
      - `team_id` (uuid, FK -> teams, nullable)
      - `invited_by` (uuid, FK -> profiles)
      - `token` (text, unique)
      - `is_accepted` (boolean, default false)
      - `expires_at` (timestamp)
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on ALL tables
    - Super Admin: full access to all tables
    - Admin: operational access (read/write, no user management beyond team members)
    - Team Member: read/write own data only
    - All policies check authentication and role ownership

  3. Important Notes
    - Billing cycle is 26th of current month to 25th of next month
    - Indian currency formatting (₹1,00,000)
    - All timestamps use timestamptz with default now()
*/

-- Profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  full_name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'team_member' CHECK (role IN ('super_admin', 'admin', 'team_member')),
  is_active boolean NOT NULL DEFAULT true,
  phone text DEFAULT '',
  avatar_url text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Teams table
CREATE TABLE IF NOT EXISTS teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  description text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Team Members junction
CREATE TABLE IF NOT EXISTS team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  joined_at timestamptz DEFAULT now(),
  UNIQUE(user_id, team_id)
);

-- Revenue entries
CREATE TABLE IF NOT EXISTS revenue_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  team_id uuid REFERENCES teams(id) ON DELETE SET NULL,
  billing_cycle_start date NOT NULL,
  billing_cycle_end date NOT NULL,
  target_amount numeric NOT NULL DEFAULT 0,
  achieved_amount numeric NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'new_business' CHECK (source IN ('new_business', 'renewal', 'upsell', 'referral')),
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Attendance entries
CREATE TABLE IF NOT EXISTS attendance_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date date NOT NULL,
  status text NOT NULL DEFAULT 'present' CHECK (status IN ('present', 'absent', 'half_day', 'leave')),
  check_in time DEFAULT NULL,
  check_out time DEFAULT NULL,
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, date)
);

-- KPI targets
CREATE TABLE IF NOT EXISTS kpi_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  team_id uuid REFERENCES teams(id) ON DELETE SET NULL,
  billing_cycle_start date NOT NULL,
  billing_cycle_end date NOT NULL,
  metric_name text NOT NULL,
  target_value numeric NOT NULL DEFAULT 0,
  achieved_value numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Invitations
CREATE TABLE IF NOT EXISTS invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  role text NOT NULL DEFAULT 'team_member' CHECK (role IN ('super_admin', 'admin', 'team_member')),
  team_id uuid REFERENCES teams(id) ON DELETE SET NULL,
  invited_by uuid NOT NULL REFERENCES profiles(id),
  token text UNIQUE NOT NULL DEFAULT gen_random_uuid()::text,
  is_accepted boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenue_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE kpi_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- Helper function to check if user is super_admin
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
AS $$ SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin') $$;

-- Helper function to check if user is admin or super_admin
CREATE OR REPLACE FUNCTION is_admin_or_above()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
AS $$ SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admin')) $$;

-- =====================
-- PROFILES POLICIES
-- =====================
CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Admins can read all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (is_admin_or_above());

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Super admins can update any profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

CREATE POLICY "Super admins can insert profiles"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (is_super_admin());

-- =====================
-- TEAMS POLICIES
-- =====================
CREATE POLICY "Admins can read teams"
  ON teams FOR SELECT
  TO authenticated
  USING (is_admin_or_above());

CREATE POLICY "Team members can read own teams"
  ON teams FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM team_members WHERE team_members.user_id = auth.uid() AND team_members.team_id = teams.id));

CREATE POLICY "Super admins can manage teams"
  ON teams FOR INSERT
  TO authenticated
  WITH CHECK (is_super_admin());

CREATE POLICY "Admins can insert teams"
  ON teams FOR INSERT
  TO authenticated
  WITH CHECK (is_admin_or_above());

CREATE POLICY "Super admins can update teams"
  ON teams FOR UPDATE
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

CREATE POLICY "Admins can update teams"
  ON teams FOR UPDATE
  TO authenticated
  USING (is_admin_or_above())
  WITH CHECK (is_admin_or_above());

CREATE POLICY "Super admins can delete teams"
  ON teams FOR DELETE
  TO authenticated
  USING (is_super_admin());

-- =====================
-- TEAM MEMBERS POLICIES
-- =====================
CREATE POLICY "Admins can read team members"
  ON team_members FOR SELECT
  TO authenticated
  USING (is_admin_or_above());

CREATE POLICY "Users can read own team memberships"
  ON team_members FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can manage team members"
  ON team_members FOR INSERT
  TO authenticated
  WITH CHECK (is_admin_or_above());

CREATE POLICY "Admins can update team members"
  ON team_members FOR UPDATE
  TO authenticated
  USING (is_admin_or_above())
  WITH CHECK (is_admin_or_above());

CREATE POLICY "Admins can delete team members"
  ON team_members FOR DELETE
  TO authenticated
  USING (is_admin_or_above());

-- =====================
-- REVENUE ENTRIES POLICIES
-- =====================
CREATE POLICY "Users can read own revenue"
  ON revenue_entries FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can read all revenue"
  ON revenue_entries FOR SELECT
  TO authenticated
  USING (is_admin_or_above());

CREATE POLICY "Users can insert own revenue"
  ON revenue_entries FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can insert any revenue"
  ON revenue_entries FOR INSERT
  TO authenticated
  WITH CHECK (is_admin_or_above());

CREATE POLICY "Users can update own revenue"
  ON revenue_entries FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can update any revenue"
  ON revenue_entries FOR UPDATE
  TO authenticated
  USING (is_admin_or_above())
  WITH CHECK (is_admin_or_above());

CREATE POLICY "Users can delete own revenue"
  ON revenue_entries FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can delete any revenue"
  ON revenue_entries FOR DELETE
  TO authenticated
  USING (is_admin_or_above());

-- =====================
-- ATTENDANCE ENTRIES POLICIES
-- =====================
CREATE POLICY "Users can read own attendance"
  ON attendance_entries FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can read all attendance"
  ON attendance_entries FOR SELECT
  TO authenticated
  USING (is_admin_or_above());

CREATE POLICY "Users can insert own attendance"
  ON attendance_entries FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can insert any attendance"
  ON attendance_entries FOR INSERT
  TO authenticated
  WITH CHECK (is_admin_or_above());

CREATE POLICY "Users can update own attendance"
  ON attendance_entries FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can update any attendance"
  ON attendance_entries FOR UPDATE
  TO authenticated
  USING (is_admin_or_above())
  WITH CHECK (is_admin_or_above());

CREATE POLICY "Admins can delete attendance"
  ON attendance_entries FOR DELETE
  TO authenticated
  USING (is_admin_or_above());

-- =====================
-- KPI TARGETS POLICIES
-- =====================
CREATE POLICY "Users can read own KPIs"
  ON kpi_targets FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));

CREATE POLICY "Admins can read all KPIs"
  ON kpi_targets FOR SELECT
  TO authenticated
  USING (is_admin_or_above());

CREATE POLICY "Admins can manage KPIs"
  ON kpi_targets FOR INSERT
  TO authenticated
  WITH CHECK (is_admin_or_above());

CREATE POLICY "Admins can update KPIs"
  ON kpi_targets FOR UPDATE
  TO authenticated
  USING (is_admin_or_above())
  WITH CHECK (is_admin_or_above());

CREATE POLICY "Admins can delete KPIs"
  ON kpi_targets FOR DELETE
  TO authenticated
  USING (is_admin_or_above());

-- =====================
-- INVITATIONS POLICIES
-- =====================
CREATE POLICY "Admins can read invitations"
  ON invitations FOR SELECT
  TO authenticated
  USING (is_admin_or_above());

CREATE POLICY "Admins can create invitations"
  ON invitations FOR INSERT
  TO authenticated
  WITH CHECK (is_admin_or_above());

CREATE POLICY "Admins can update invitations"
  ON invitations FOR UPDATE
  TO authenticated
  USING (is_admin_or_above())
  WITH CHECK (is_admin_or_above());

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_revenue_user_cycle ON revenue_entries(user_id, billing_cycle_start);
CREATE INDEX IF NOT EXISTS idx_revenue_team_cycle ON revenue_entries(team_id, billing_cycle_start);
CREATE INDEX IF NOT EXISTS idx_attendance_user_date ON attendance_entries(user_id, date);
CREATE INDEX IF NOT EXISTS idx_kpi_user_cycle ON kpi_targets(user_id, billing_cycle_start);
CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(email);

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_teams_updated_at BEFORE UPDATE ON teams FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_revenue_updated_at BEFORE UPDATE ON revenue_entries FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_attendance_updated_at BEFORE UPDATE ON attendance_entries FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_kpi_updated_at BEFORE UPDATE ON kpi_targets FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Trigger to auto-create profile on user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, role)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), 'team_member');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
