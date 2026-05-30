export type Role = 'super_admin' | 'admin' | 'team_member';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  is_active: boolean;
  phone: string;
  avatar_url: string;
  created_at: string;
  updated_at: string;
}

export interface Team {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface TeamMember {
  id: string;
  user_id: string;
  team_id: string;
  joined_at: string;
  profile?: Profile;
  team?: Team;
}

export interface RevenueEntry {
  id: string;
  user_id: string;
  team_id: string | null;
  billing_cycle_start: string;
  billing_cycle_end: string;
  target_amount: number;
  achieved_amount: number;
  source: 'new_business' | 'renewal' | 'upsell' | 'referral';
  notes: string;
  created_at: string;
  updated_at: string;
  profile?: Profile;
  team?: Team;
}

export type AttendanceStatus = 'present' | 'absent' | 'half_day' | 'leave' | 'week_off';

export interface AttendanceEntry {
  id: string;
  user_id: string;
  date: string;
  status: AttendanceStatus;
  check_in: string | null;
  check_out: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
  profile?: Profile;
}

export interface KpiTarget {
  id: string;
  user_id: string | null;
  team_id: string | null;
  billing_cycle_start: string;
  billing_cycle_end: string;
  metric_name: string;
  target_value: number;
  achieved_value: number;
  created_at: string;
  updated_at: string;
  profile?: Profile;
  team?: Team;
}

export interface Invitation {
  id: string;
  email: string;
  role: Role;
  team_id: string | null;
  invited_by: string;
  token: string;
  is_accepted: boolean;
  expires_at: string;
  created_at: string;
}

// Lead Assignment - operational spreadsheet table (primary revenue source)
export interface LeadAssignment {
  id: string;
  user_id: string;
  team_id: string | null;
  assigned_date: string;
  leads_assigned: number;
  revenue: number;
  batch_name: string;
  billing_cycle_start: string;
  billing_cycle_end: string;
  notes: string;
  created_at: string;
  updated_at: string;
  profile?: Profile;
  team?: Team;
}

// Legacy fields kept for DB compatibility but not used in new UI
export interface LeadAssignmentLegacy {
  lead_name: string;
  lead_email: string;
  lead_phone: string;
  lead_source: string;
  status: string;
  estimated_value: number;
  actual_value: number;
  probability: number;
}

export interface WeeklyTarget {
  id: string;
  user_id: string;
  team_id: string | null;
  week_start: string;
  week_end: string;
  metric_name: string;
  target_value: number;
  achieved_value: number;
  created_at: string;
  updated_at: string;
  profile?: Profile;
}

export type MonthlyTargetCategory = 'revenue' | 'leads' | 'calls' | 'meetings' | 'conversions';

export interface MonthlyTarget {
  id: string;
  user_id: string | null;
  team_id: string | null;
  billing_cycle_start: string;
  billing_cycle_end: string;
  metric_name: string;
  target_value: number;
  achieved_value: number;
  category: MonthlyTargetCategory;
  created_at: string;
  updated_at: string;
  profile?: Profile;
  team?: Team;
}

export type KpiUnit = 'currency' | 'count' | 'percentage';

export interface KpiMetric {
  id: string;
  user_id: string | null;
  team_id: string | null;
  billing_cycle_start: string;
  billing_cycle_end: string;
  metric_name: string;
  metric_key: string;
  target_value: number;
  achieved_value: number;
  unit: KpiUnit;
  weight: number;
  created_at: string;
  updated_at: string;
  profile?: Profile;
  team?: Team;
}

export interface BillingCycle {
  id: string;
  cycle_start: string;
  cycle_end: string;
  label: string;
  is_current: boolean;
  is_locked: boolean;
  notes: string;
  created_at: string;
  updated_at: string;
}

export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: NotificationType;
  is_read: boolean;
  related_entity_type: string;
  related_entity_id: string | null;
  created_at: string;
}

export type ReportType = 'revenue' | 'attendance' | 'kpi' | 'performance' | 'leads';

export interface SavedReport {
  id: string;
  created_by: string;
  report_type: ReportType;
  title: string;
  description: string;
  config: Record<string, any>;
  billing_cycle_start: string | null;
  billing_cycle_end: string | null;
  is_scheduled: boolean;
  schedule_frequency: string | null;
  created_at: string;
  updated_at: string;
}

export interface CallLog {
  id: string;
  user_id: string;
  lead_id: string | null;
  call_type: 'outbound' | 'inbound';
  duration_seconds: number;
  notes: string;
  called_at: string;
  created_at: string;
}
