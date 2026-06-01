import { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import {
  Users,
  UserPlus,
  Search,
  Filter,
  MoreVertical,
  Edit2,
  Trash2,
  Copy,
  Download,
  Upload,
  Check,
  X as XIcon,
  UserCheck,
  UserX,
  ChevronDown,
  CheckSquare,
  Square,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { cn } from '../lib/utils';
import Spinner from '../components/ui/Spinner';
import type { Profile, Role } from '../types';

interface TeamMemberFormData {
  full_name: string;
  email: string;
  phone: string;
  designation: string;
  role: Role;
  is_active: boolean;
  joining_date: string;
}

interface ExtendedProfile extends Profile {
  designation?: string;
  joining_date?: string;
}

interface RankedMember {
  id: string;
  full_name: string;
  email: string;
  total_revenue: number;
  total_leads: number;
  total_calls: number;
  total_talk_time: number;
  attendance_pct: number;
  arpu: number;
  achievement_pct: number;
  overall_score: number;
}

const initialFormData: TeamMemberFormData = {
  full_name: '',
  email: '',
  phone: '',
  designation: '',
  role: 'team_member',
  is_active: true,
  joining_date: new Date().toISOString().split('T')[0],
};

const roleOptions: { value: Role; label: string }[] = [
  { value: 'super_admin', label: 'Super Admin' },
  { value: 'admin', label: 'Admin' },
  { value: 'team_member', label: 'Team Member' },
];

const statusOptions = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

const formatDuration = (seconds: number) => {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m`;
};

export default function TeamPage() {
  const [members, setMembers] = useState<ExtendedProfile[]>([]);
  const [rankedMembers, setRankedMembers] = useState<RankedMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<Role | ''>('');
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | ''>('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [editingMember, setEditingMember] = useState<ExtendedProfile | null>(null);
  const [formData, setFormData] = useState<TeamMemberFormData>(initialFormData);
  const [inlineEdit, setInlineEdit] = useState<{ id: string; field: string } | null>(null);
  const [inlineValue, setInlineValue] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);
  const [showActionsMenu, setShowActionsMenu] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setMembers(data || []);
    } catch (error) {
      console.error('Error fetching members:', error);
      toast.error('Failed to load team members');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchRankedMembers = useCallback(async () => {
    try {
      const cs = '2026-05-26';
      const ce = '2026-06-25';

      const { data: leads } = await supabase
        .from('lead_assignments')
        .select('user_id, revenue, leads_assigned')
        .gte('billing_cycle_start', cs)
        .lte('billing_cycle_end', ce);

      const { data: kpi } = await supabase
        .from('daily_kpi')
        .select('user_id, call_attempts, talk_time')
        .gte('date', cs)
        .lte('date', ce);

      const { data: attendance } = await supabase
        .from('attendance_entries')
        .select('user_id, status')
        .gte('date', cs)
        .lte('date', ce);

      const { data: targets } = await supabase
        .from('monthly_targets')
        .select('user_id, target_value')
        .eq('category', 'revenue')
        .eq('billing_cycle_start', cs)
        .eq('billing_cycle_end', ce);

      const userMap = new Map();
      
      members.forEach(member => {
        userMap.set(member.id, {
          id: member.id,
          full_name: member.full_name,
          email: member.email,
          total_revenue: 0,
          total_leads: 0,
          total_calls: 0,
          total_talk_time: 0,
          attendance_count: 0,
          attendance_pct: 0,
          achievement_pct: 0,
        });
      });

      leads?.forEach(l => {
        const user = userMap.get(l.user_id);
        if (user) {
          user.total_revenue += l.revenue || 0;
          user.total_leads += l.leads_assigned || 0;
        }
      });

      kpi?.forEach(k => {
        const user = userMap.get(k.user_id);
        if (user) {
          user.total_calls += k.call_attempts || 0;
          user.total_talk_time += k.talk_time || 0;
        }
      });

      const attendanceCount = new Map();
      const presentStatuses = ['present', 'half_day'];
      attendance?.forEach(a => {
        if (presentStatuses.includes(a.status)) {
          attendanceCount.set(a.user_id, (attendanceCount.get(a.user_id) || 0) + 1);
        }
      });
      
      const totalDays = 30;
      attendanceCount.forEach((count, userId) => {
        const user = userMap.get(userId);
        if (user) {
          user.attendance_pct = Math.round((count / totalDays) * 100);
        }
      });

      userMap.forEach(user => {
        if (user.attendance_pct === 0 && user.total_leads > 0) {
          user.attendance_pct = 100;
        }
      });

      const targetMap = new Map();
      targets?.forEach(t => {
        targetMap.set(t.user_id, t.target_value);
      });

      const rankedList: RankedMember[] = [];
      userMap.forEach(user => {
        const target = targetMap.get(user.id) || 700000;
        const achievement_pct = user.total_revenue > 0 ? Math.round((user.total_revenue / target) * 100 * 10) / 10 : 0;
        const arpu = user.total_leads > 0 ? user.total_revenue / user.total_leads : 0;
        
        const revenueScore = Math.min((user.total_revenue / 100000) * 0.4, 40);
        const callsScore = Math.min((user.total_calls / 500) * 0.3, 30);
        const attendanceScore = (user.attendance_pct / 100) * 30;
        const overall_score = Math.round((revenueScore + callsScore + attendanceScore) * 10) / 10;
        
        rankedList.push({
          id: user.id,
          full_name: user.full_name,
          email: user.email,
          total_revenue: user.total_revenue,
          total_leads: user.total_leads,
          total_calls: user.total_calls,
          total_talk_time: user.total_talk_time,
          attendance_pct: user.attendance_pct,
          arpu: arpu,
          achievement_pct: achievement_pct,
          overall_score: overall_score,
        });
      });

      const sorted = rankedList.sort((a, b) => b.overall_score - a.overall_score);
      setRankedMembers(sorted);
    } catch (error) {
      console.error('Error fetching rankings:', error);
    }
  }, [members]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  useEffect(() => {
    if (members.length > 0) {
      fetchRankedMembers();
    }
  }, [members, fetchRankedMembers]);

  useEffect(() => {
    const handleClickOutside = () => {
      setShowActionsMenu(null);
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const generateInviteLinkFromToken = (token: string) => {
    const baseUrl = window.location.origin;
    return `${baseUrl}/invite?token=${encodeURIComponent(token)}`;
  };

  const copyInviteLink = async (member: ExtendedProfile) => {
    try {
      const { data: existingInvite } = await supabase
        .from('invitations')
        .select('token, expires_at')
        .eq('email', member.email)
        .eq('is_accepted', false)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

      let token: string;

      if (existingInvite) {
        token = existingInvite.token;
      } else {
        token = crypto.randomUUID();
        const { data: { user } } = await supabase.auth.getUser();

        const { error: inviteError } = await supabase
          .from('invitations')
          .insert({
            email: member.email,
            role: member.role,
            invited_by: user?.id,
            token: token,
            is_accepted: false,
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          });

        if (inviteError) throw inviteError;
      }

      const inviteLink = generateInviteLinkFromToken(token);
      await navigator.clipboard.writeText(inviteLink);
      toast.success('Invite link copied to clipboard!');
    } catch (error) {
      console.error('Error creating invite link:', error);
      toast.error('Failed to create invite link');
    }
    setShowActionsMenu(null);
  };

  const filteredMembers = members.filter((member) => {
    const matchesSearch =
      member.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      member.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = !roleFilter || member.role === roleFilter;
    const matchesStatus =
      !statusFilter ||
      (statusFilter === 'active' && member.is_active) ||
      (statusFilter === 'inactive' && !member.is_active);
    return matchesSearch && matchesRole && matchesStatus;
  });

  const stats = {
    total: members.length,
    active: members.filter((m) => m.is_active).length,
    inactive: members.filter((m) => !m.is_active).length,
    superAdmins: members.filter((m) => m.role === 'super_admin').length,
    admins: members.filter((m) => m.role === 'admin').length,
    teamMembers: members.filter((m) => m.role === 'team_member').length,
  };

  const handleAddMember = async () => {
    if (!formData.full_name.trim() || !formData.email.trim()) {
      toast.error('Name and email are required');
      return;
    }

    setSubmitting(true);
    try {
      const { data: existingUser } = await supabase
        .from('profiles')
        .select('id, email')
        .eq('email', formData.email.toLowerCase().trim())
        .maybeSingle();

      if (existingUser) {
        toast.error('A user with this email already exists');
        setSubmitting(false);
        return;
      }

      const { data: existingInvite } = await supabase
        .from('invitations')
        .select('id')
        .eq('email', formData.email.toLowerCase().trim())
        .eq('is_accepted', false)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

      if (existingInvite) {
        toast.error('An invitation has already been sent to this email');
        setSubmitting(false);
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      const token = crypto.randomUUID();

      const { error: inviteError } = await supabase
        .from('invitations')
        .insert({
          email: formData.email.toLowerCase().trim(),
          role: formData.role,
          invited_by: user?.id,
          token: token,
          is_accepted: false,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        });

      if (inviteError) throw inviteError;

      const inviteLink = generateInviteLinkFromToken(token);

      try {
        await navigator.clipboard.writeText(inviteLink);
        toast.success('Invitation created! Link copied to clipboard.');
      } catch {
        toast.success(`Invitation created! Share this link: ${inviteLink}`);
      }

      setShowAddModal(false);
      setFormData(initialFormData);
      fetchMembers();
    } catch (error: any) {
      console.error('Error creating invitation:', error);
      toast.error(error.message || 'Failed to create invitation');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditMember = async () => {
    if (!editingMember || !formData.full_name.trim() || !formData.email.trim()) {
      toast.error('Name and email are required');
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: formData.full_name,
          email: formData.email,
          phone: formData.phone || null,
          designation: formData.designation || null,
          role: formData.role,
          is_active: formData.is_active,
          joining_date: formData.joining_date || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingMember.id);

      if (error) throw error;
      toast.success('Team member updated successfully');
      setShowEditModal(false);
      setEditingMember(null);
      setFormData(initialFormData);
      fetchMembers();
    } catch (error) {
      console.error('Error updating member:', error);
      toast.error('Failed to update team member');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteMember = async (id: string) => {
    try {
      const { error } = await supabase.from('profiles').delete().eq('id', id);
      if (error) throw error;
      toast.success('Team member deleted successfully');
      setShowDeleteConfirm(null);
      setSelectedMembers((prev) => {
        const newSet = new Set(prev);
        newSet.delete(id);
        return newSet;
      });
      fetchMembers();
    } catch (error) {
      console.error('Error deleting member:', error);
      toast.error('Failed to delete team member');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedMembers.size === 0) return;

    try {
      const { error } = await supabase
        .from('profiles')
        .delete()
        .in('id', Array.from(selectedMembers));

      if (error) throw error;
      toast.success(`${selectedMembers.size} members deleted successfully`);
      setSelectedMembers(new Set());
      fetchMembers();
    } catch (error) {
      console.error('Error bulk deleting:', error);
      toast.error('Failed to delete members');
    }
  };

  const toggleStatus = async (member: ExtendedProfile) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          is_active: !member.is_active,
          updated_at: new Date().toISOString(),
        })
        .eq('id', member.id);

      if (error) throw error;
      toast.success(`Member ${!member.is_active ? 'activated' : 'deactivated'} successfully`);
      fetchMembers();
    } catch (error) {
      console.error('Error toggling status:', error);
      toast.error('Failed to update status');
    }
    setShowActionsMenu(null);
  };

  const handleInlineEdit = async (member: ExtendedProfile) => {
    if (!inlineEdit) return;

    try {
      const updateData: Record<string, string | boolean> = {
        updated_at: new Date().toISOString(),
      };

      if (inlineEdit.field === 'full_name') {
        updateData.full_name = inlineValue;
      } else if (inlineEdit.field === 'email') {
        updateData.email = inlineValue;
      } else if (inlineEdit.field === 'phone') {
        updateData.phone = inlineValue;
      } else if (inlineEdit.field === 'designation') {
        updateData.designation = inlineValue;
      } else if (inlineEdit.field === 'role') {
        updateData.role = inlineValue as Role;
      } else if (inlineEdit.field === 'joining_date') {
        updateData.joining_date = inlineValue;
      }

      const { error } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', member.id);

      if (error) throw error;
      toast.success('Field updated successfully');
      fetchMembers();
    } catch (error) {
      console.error('Error updating field:', error);
      toast.error('Failed to update field');
    }
    setInlineEdit(null);
    setInlineValue('');
  };

  const startInlineEdit = (member: ExtendedProfile, field: string) => {
    let value = '';
    if (field === 'full_name') value = member.full_name;
    else if (field === 'email') value = member.email;
    else if (field === 'phone') value = member.phone || '';
    else if (field === 'designation') value = (member as ExtendedProfile).designation || '';
    else if (field === 'role') value = member.role;
    else if (field === 'joining_date') value = (member as ExtendedProfile).joining_date || '';

    setInlineEdit({ id: member.id, field });
    setInlineValue(value);
  };

  const cancelInlineEdit = () => {
    setInlineEdit(null);
    setInlineValue('');
  };

  const openEditModal = (member: ExtendedProfile) => {
    setEditingMember(member);
    setFormData({
      full_name: member.full_name,
      email: member.email,
      phone: member.phone || '',
      designation: (member as ExtendedProfile).designation || '',
      role: member.role,
      is_active: member.is_active,
      joining_date: (member as ExtendedProfile).joining_date || '',
    });
    setShowEditModal(true);
    setShowActionsMenu(null);
  };

  const toggleSelectAll = () => {
    if (selectedMembers.size === filteredMembers.length) {
      setSelectedMembers(new Set());
    } else {
      setSelectedMembers(new Set(filteredMembers.map((m) => m.id)));
    }
  };

  const toggleSelectMember = (id: string) => {
    setSelectedMembers((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const exportToCSV = () => {
    const data = filteredMembers.map((m) => ({
      'Full Name': m.full_name,
      Email: m.email,
      Mobile: m.phone || '',
      Designation: (m as ExtendedProfile).designation || '',
      Role: m.role,
      Status: m.is_active ? 'Active' : 'Inactive',
      'Joining Date': (m as ExtendedProfile).joining_date || '',
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Team Members');
    XLSX.writeFile(wb, 'team_members.xlsx');
    toast.success('Exported to Excel successfully');
  };

  const importFromFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData: unknown[] = XLSX.utils.sheet_to_json(sheet);

      const membersToImport = jsonData.map((row: any) => ({
        full_name: String(row['Full Name'] || row['full_name'] || ''),
        email: String(row['Email'] || row['email'] || ''),
        phone: String(row['Mobile'] || row['phone'] || '') || null,
        designation: String(row['Designation'] || row['designation'] || '') || null,
        role: (row['Role'] || row['role'] || 'team_member') as Role,
        is_active: String(row['Status'] || row['is_active'] || 'active').toLowerCase() === 'active',
        joining_date: String(row['Joining Date'] || row['joining_date'] || '') || null,
      }));

      const validMembers = membersToImport.filter((m) => m.full_name && m.email);

      if (validMembers.length === 0) {
        toast.error('No valid members found in file');
        return;
      }

      const { error } = await supabase.from('profiles').insert(
        validMembers.map((m) => ({
          ...m,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }))
      );

      if (error) throw error;
      toast.success(`Imported ${validMembers.length} members successfully`);
      fetchMembers();
    } catch (error) {
      console.error('Error importing:', error);
      toast.error('Failed to import members');
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-primary flex items-center gap-2">
              <Users className="w-8 h-8" />
              Team Members
            </h1>
            <p className="text-secondary mt-1">Manage your team members and their roles</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              type="file"
              ref={fileInputRef}
              accept=".csv,.xlsx,.xls"
              onChange={importFromFile}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="btn-secondary flex items-center gap-2"
            >
              <Upload className="w-4 h-4" />
              Import
            </button>
            <button
              onClick={exportToCSV}
              className="btn-secondary flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
            <button
              onClick={() => {
                setFormData(initialFormData);
                setShowAddModal(true);
              }}
              className="btn-primary flex items-center gap-2"
            >
              <UserPlus className="w-4 h-4" />
              Add Member
            </button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        <div className="card rounded-xl p-4">
          <p className="text-sm text-secondary">Total</p>
          <p className="text-2xl font-bold text-primary">{stats.total}</p>
        </div>
        <div className="card rounded-xl p-4">
          <p className="text-sm text-secondary">Active</p>
          <p className="text-2xl font-bold text-green-600">{stats.active}</p>
        </div>
        <div className="card rounded-xl p-4">
          <p className="text-sm text-secondary">Inactive</p>
          <p className="text-2xl font-bold text-red-600">{stats.inactive}</p>
        </div>
        <div className="card rounded-xl p-4">
          <p className="text-sm text-secondary">Super Admins</p>
          <p className="text-2xl font-bold text-purple-600">{stats.superAdmins}</p>
        </div>
        <div className="card rounded-xl p-4">
          <p className="text-sm text-secondary">Admins</p>
          <p className="text-2xl font-bold text-blue-600">{stats.admins}</p>
        </div>
        <div className="card rounded-xl p-4">
          <p className="text-sm text-secondary">Team Members</p>
          <p className="text-2xl font-bold text-primary">{stats.teamMembers}</p>
        </div>
      </div>

      {/* Team Rankings Table - FIXED SECTION ONLY */}
      <div className="card rounded-xl p-6 mb-6">
        <h2 className="text-lg font-semibold text-primary mb-4">Team Rankings</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider w-16">Rank</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Team Member</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Revenue</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Leads</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Attendance %</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Calls</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Talk Time</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">ARPU</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Achievement %</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Overall</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {rankedMembers.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-gray-500">
                    No ranking data available
                  </td>
                </tr>
              ) : (
                rankedMembers.map((member, index) => (
                  <tr key={member.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-center font-bold text-gray-900">{index + 1}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{member.full_name}</div>
                      <div className="text-xs text-gray-500">{member.email}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                      {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(member.total_revenue)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">{member.total_leads}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                        member.attendance_pct >= 90 ? 'bg-green-100 text-green-800' :
                        member.attendance_pct >= 75 ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {member.attendance_pct}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">{member.total_calls}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{formatDuration(member.total_talk_time)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-blue-600">
                      {member.total_leads > 0 ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(member.arpu) : '-'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                        member.achievement_pct >= 100 ? 'bg-green-100 text-green-800' :
                        member.achievement_pct >= 50 ? 'bg-blue-100 text-blue-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {member.achievement_pct}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-gray-900">{member.overall_score}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="card rounded-xl p-4 mb-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary" />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input w-full pl-10 pr-4 py-2"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              'px-4 py-2 border rounded-lg flex items-center gap-2 transition',
              showFilters ? 'bg-blue-50 border-blue-200 text-blue-700' : 'btn-secondary'
            )}
          >
            <Filter className="w-4 h-4" />
            Filters
            <ChevronDown className={cn('w-4 h-4 transition-transform', showFilters && 'rotate-180')} />
          </button>
        </div>

        {showFilters && (
          <div className="mt-4 flex flex-wrap gap-4 pt-4 border-t border-[rgb(var(--border-default))]">
            <div>
              <label className="block text-sm font-medium text-secondary mb-1">Role</label>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as Role | '')}
                className="input px-3 py-2"
              >
                <option value="">All Roles</option>
                {roleOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-secondary mb-1">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'active' | 'inactive' | '')}
                className="input px-3 py-2"
              >
                <option value="">All Status</option>
                {statusOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            {(roleFilter || statusFilter || searchQuery) && (
              <button
                onClick={() => {
                  setRoleFilter('');
                  setStatusFilter('');
                  setSearchQuery('');
                }}
                className="self-end px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition"
              >
                Clear Filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* Bulk Actions */}
      {selectedMembers.size > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 flex items-center justify-between">
          <span>{selectedMembers.size} member{selectedMembers.size > 1 ? 's' : ''} selected</span>
          <div className="flex gap-2">
            <button onClick={() => setSelectedMembers(new Set())} className="btn-secondary">Cancel</button>
            <button onClick={handleBulkDelete} className="px-3 py-1 bg-red-600 text-white rounded-lg hover:bg-red-700 transition flex items-center gap-1">
              <Trash2 className="w-4 h-4" />
              Delete Selected
            </button>
          </div>
        </div>
      )}

      {/* Members Table */}
      <div className="table-container rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="table-header sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 text-left">
                  <button onClick={toggleSelectAll} className="p-1 hover:bg-[rgb(var(--bg-elevated))] rounded">
                    {selectedMembers.size === filteredMembers.length && filteredMembers.length > 0 ? (
                      <CheckSquare className="w-5 h-5 text-blue-600" />
                    ) : (
                      <Square className="w-5 h-5 text-secondary" />
                    )}
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-secondary">Full Name</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-secondary">Email</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-secondary hidden md:table-cell">Mobile</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-secondary hidden lg:table-cell">Designation</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-secondary">Role</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-secondary">Status</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-secondary hidden xl:table-cell">Joining Date</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-secondary">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredMembers.length === 0 ? (
                <tr className="table-row">
                  <td colSpan={9} className="px-4 py-8 text-center text-secondary">No team members found</td>
                </tr>
              ) : (
                filteredMembers.map((member) => (
                  <tr key={member.id} className={cn('table-row', selectedMembers.has(member.id) && 'bg-blue-50')}>
                    <td className="px-4 py-3">
                      <button onClick={() => toggleSelectMember(member.id)} className="p-1 hover:bg-[rgb(var(--bg-elevated))] rounded">
                        {selectedMembers.has(member.id) ? <CheckSquare className="w-5 h-5 text-blue-600" /> : <Square className="w-5 h-5 text-secondary" />}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      {inlineEdit?.id === member.id && inlineEdit.field === 'full_name' ? (
                        <div className="flex items-center gap-1">
                          <input type="text" value={inlineValue} onChange={(e) => setInlineValue(e.target.value)} className="input px-2 py-1" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') handleInlineEdit(member); if (e.key === 'Escape') cancelInlineEdit(); }} />
                          <button onClick={() => handleInlineEdit(member)} className="p-1 text-green-600"><Check className="w-4 h-4" /></button>
                          <button onClick={cancelInlineEdit} className="p-1 text-red-600"><XIcon className="w-4 h-4" /></button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 cursor-pointer group" onClick={() => startInlineEdit(member, 'full_name')}>
                          <span className="font-medium text-primary">{member.full_name}</span>
                          <Edit2 className="w-3 h-3 text-secondary opacity-0 group-hover:opacity-100 transition" />
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {inlineEdit?.id === member.id && inlineEdit.field === 'email' ? (
                        <div className="flex items-center gap-1">
                          <input type="email" value={inlineValue} onChange={(e) => setInlineValue(e.target.value)} className="input px-2 py-1 w-48" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') handleInlineEdit(member); if (e.key === 'Escape') cancelInlineEdit(); }} />
                          <button onClick={() => handleInlineEdit(member)} className="p-1 text-green-600"><Check className="w-4 h-4" /></button>
                          <button onClick={cancelInlineEdit} className="p-1 text-red-600"><XIcon className="w-4 h-4" /></button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 cursor-pointer group" onClick={() => startInlineEdit(member, 'email')}>
                          <span className="text-secondary text-sm">{member.email}</span>
                          <Edit2 className="w-3 h-3 text-secondary opacity-0 group-hover:opacity-100 transition" />
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {inlineEdit?.id === member.id && inlineEdit.field === 'phone' ? (
                        <div className="flex items-center gap-1">
                          <input type="tel" value={inlineValue} onChange={(e) => setInlineValue(e.target.value)} className="input px-2 py-1 w-32" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') handleInlineEdit(member); if (e.key === 'Escape') cancelInlineEdit(); }} />
                          <button onClick={() => handleInlineEdit(member)} className="p-1 text-green-600"><Check className="w-4 h-4" /></button>
                          <button onClick={cancelInlineEdit} className="p-1 text-red-600"><XIcon className="w-4 h-4" /></button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 cursor-pointer group" onClick={() => startInlineEdit(member, 'phone')}>
                          <span className="text-secondary text-sm">{member.phone || '-'}</span>
                          <Edit2 className="w-3 h-3 text-secondary opacity-0 group-hover:opacity-100 transition" />
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {inlineEdit?.id === member.id && inlineEdit.field === 'designation' ? (
                        <div className="flex items-center gap-1">
                          <input type="text" value={inlineValue} onChange={(e) => setInlineValue(e.target.value)} className="input px-2 py-1 w-32" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') handleInlineEdit(member); if (e.key === 'Escape') cancelInlineEdit(); }} />
                          <button onClick={() => handleInlineEdit(member)} className="p-1 text-green-600"><Check className="w-4 h-4" /></button>
                          <button onClick={cancelInlineEdit} className="p-1 text-red-600"><XIcon className="w-4 h-4" /></button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 cursor-pointer group" onClick={() => startInlineEdit(member, 'designation')}>
                          <span className="text-secondary text-sm">{(member as ExtendedProfile).designation || '-'}</span>
                          <Edit2 className="w-3 h-3 text-secondary opacity-0 group-hover:opacity-100 transition" />
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {inlineEdit?.id === member.id && inlineEdit.field === 'role' ? (
                        <div className="flex items-center gap-1">
                          <select value={inlineValue} onChange={(e) => setInlineValue(e.target.value)} className="input px-2 py-1 text-sm" autoFocus>
                            {roleOptions.map((opt) => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
                          </select>
                          <button onClick={() => handleInlineEdit(member)} className="p-1 text-green-600"><Check className="w-4 h-4" /></button>
                          <button onClick={cancelInlineEdit} className="p-1 text-red-600"><XIcon className="w-4 h-4" /></button>
                        </div>
                      ) : (
                        <div className="cursor-pointer group" onClick={() => startInlineEdit(member, 'role')}>
                          <span className={cn('inline-flex items-center px-2 py-1 rounded-full text-xs font-medium',
                            member.role === 'super_admin' && 'bg-purple-100 text-purple-700',
                            member.role === 'admin' && 'bg-blue-100 text-blue-700',
                            member.role === 'team_member' && 'bg-[rgb(var(--bg-elevated))] text-secondary'
                          )}>
                            {roleOptions.find((r) => r.value === member.role)?.label || member.role}
                          </span>
                          <Edit2 className="w-3 h-3 text-secondary opacity-0 group-hover:opacity-100 transition inline ml-1" />
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => toggleStatus(member)} className={cn('inline-flex items-center px-2 py-1 rounded-full text-xs font-medium transition',
                        member.is_active ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-red-100 text-red-700 hover:bg-red-200'
                      )}>
                        {member.is_active ? <><UserCheck className="w-3 h-3 mr-1" />Active</> : <><UserX className="w-3 h-3 mr-1" />Inactive</>}
                      </button>
                    </td>
                    <td className="px-4 py-3 hidden xl:table-cell">
                      {inlineEdit?.id === member.id && inlineEdit.field === 'joining_date' ? (
                        <div className="flex items-center gap-1">
                          <input type="date" value={inlineValue} onChange={(e) => setInlineValue(e.target.value)} className="input px-2 py-1" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') handleInlineEdit(member); if (e.key === 'Escape') cancelInlineEdit(); }} />
                          <button onClick={() => handleInlineEdit(member)} className="p-1 text-green-600"><Check className="w-4 h-4" /></button>
                          <button onClick={cancelInlineEdit} className="p-1 text-red-600"><XIcon className="w-4 h-4" /></button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 cursor-pointer group" onClick={() => startInlineEdit(member, 'joining_date')}>
                          <span className="text-secondary text-sm">{(member as ExtendedProfile).joining_date ? new Date((member as ExtendedProfile).joining_date!).toLocaleDateString() : '-'}</span>
                          <Edit2 className="w-3 h-3 text-secondary opacity-0 group-hover:opacity-100 transition" />
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="relative">
                        <button onClick={(e) => { e.stopPropagation(); setShowActionsMenu(showActionsMenu === member.id ? null : member.id); }} className="p-1 hover:bg-[rgb(var(--bg-elevated))] rounded">
                          <MoreVertical className="w-5 h-5 text-secondary" />
                        </button>
                        {showActionsMenu === member.id && (
                          <div className="absolute right-0 mt-1 w-48 card rounded-lg shadow-lg py-1 z-20" onClick={(e) => e.stopPropagation()}>
                            <button onClick={() => openEditModal(member)} className="w-full px-4 py-2 text-left text-sm text-primary hover:bg-[rgb(var(--bg-elevated))] flex items-center gap-2"><Edit2 className="w-4 h-4" />Edit Member</button>
                            <button onClick={() => copyInviteLink(member)} className="w-full px-4 py-2 text-left text-sm text-primary hover:bg-[rgb(var(--bg-elevated))] flex items-center gap-2"><Copy className="w-4 h-4" />Copy Invite Link</button>
                            <button onClick={() => toggleStatus(member)} className="w-full px-4 py-2 text-left text-sm text-primary hover:bg-[rgb(var(--bg-elevated))] flex items-center gap-2">{member.is_active ? <><UserX className="w-4 h-4" />Deactivate</> : <><UserCheck className="w-4 h-4" />Activate</>}</button>
                            <hr className="my-1 border-[rgb(var(--border-default))]" />
                            <button onClick={() => { setShowDeleteConfirm(member.id); setShowActionsMenu(null); }} className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"><Trash2 className="w-4 h-4" />Delete Member</button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Member Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-[rgb(var(--border-default))]">
              <h2 className="text-xl font-semibold text-primary flex items-center gap-2"><UserPlus className="w-5 h-5" />Add Team Member</h2>
            </div>
            <div className="p-6 space-y-4">
              <div><label className="block text-sm font-medium text-secondary mb-1">Full Name <span className="text-red-500">*</span></label><input type="text" value={formData.full_name} onChange={(e) => setFormData({ ...formData, full_name: e.target.value })} className="input w-full px-3 py-2" placeholder="John Doe" /></div>
              <div><label className="block text-sm font-medium text-secondary mb-1">Email <span className="text-red-500">*</span></label><input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="input w-full px-3 py-2" placeholder="john@example.com" /></div>
              <div><label className="block text-sm font-medium text-secondary mb-1">Mobile</label><input type="tel" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className="input w-full px-3 py-2" placeholder="+91 9876543210" /></div>
              <div><label className="block text-sm font-medium text-secondary mb-1">Designation</label><input type="text" value={formData.designation} onChange={(e) => setFormData({ ...formData, designation: e.target.value })} className="input w-full px-3 py-2" placeholder="Software Engineer" /></div>
              <div><label className="block text-sm font-medium text-secondary mb-1">Role</label><select value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value as Role })} className="input w-full px-3 py-2">{roleOptions.map((opt) => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}</select></div>
              <div><label className="block text-sm font-medium text-secondary mb-1">Joining Date</label><input type="date" value={formData.joining_date} onChange={(e) => setFormData({ ...formData, joining_date: e.target.value })} className="input w-full px-3 py-2" /></div>
              <div className="flex items-center gap-2"><input type="checkbox" id="is_active" checked={formData.is_active} onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })} className="w-4 h-4 rounded" /><label htmlFor="is_active" className="text-sm text-secondary">Active (can login)</label></div>
            </div>
            <div className="p-6 border-t border-[rgb(var(--border-default))] flex justify-end gap-3">
              <button onClick={() => { setShowAddModal(false); setFormData(initialFormData); }} className="btn-secondary">Cancel</button>
              <button onClick={handleAddMember} disabled={submitting} className="btn-primary disabled:opacity-50 flex items-center gap-2">{submitting && <Spinner size="sm" />}Add Member</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Member Modal */}
      {showEditModal && editingMember && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-[rgb(var(--border-default))]">
              <h2 className="text-xl font-semibold text-primary flex items-center gap-2"><Edit2 className="w-5 h-5" />Edit Team Member</h2>
            </div>
            <div className="p-6 space-y-4">
              <div><label className="block text-sm font-medium text-secondary mb-1">Full Name <span className="text-red-500">*</span></label><input type="text" value={formData.full_name} onChange={(e) => setFormData({ ...formData, full_name: e.target.value })} className="input w-full px-3 py-2" /></div>
              <div><label className="block text-sm font-medium text-secondary mb-1">Email <span className="text-red-500">*</span></label><input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="input w-full px-3 py-2" /></div>
              <div><label className="block text-sm font-medium text-secondary mb-1">Mobile</label><input type="tel" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className="input w-full px-3 py-2" /></div>
              <div><label className="block text-sm font-medium text-secondary mb-1">Designation</label><input type="text" value={formData.designation} onChange={(e) => setFormData({ ...formData, designation: e.target.value })} className="input w-full px-3 py-2" /></div>
              <div><label className="block text-sm font-medium text-secondary mb-1">Role</label><select value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value as Role })} className="input w-full px-3 py-2">{roleOptions.map((opt) => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}</select></div>
              <div><label className="block text-sm font-medium text-secondary mb-1">Joining Date</label><input type="date" value={formData.joining_date} onChange={(e) => setFormData({ ...formData, joining_date: e.target.value })} className="input w-full px-3 py-2" /></div>
              <div className="flex items-center gap-2"><input type="checkbox" id="edit_is_active" checked={formData.is_active} onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })} className="w-4 h-4 rounded" /><label htmlFor="edit_is_active" className="text-sm text-secondary">Active (can login)</label></div>
            </div>
            <div className="p-6 border-t border-[rgb(var(--border-default))] flex justify-end gap-3">
              <button onClick={() => { setShowEditModal(false); setEditingMember(null); setFormData(initialFormData); }} className="btn-secondary">Cancel</button>
              <button onClick={handleEditMember} disabled={submitting} className="btn-primary disabled:opacity-50 flex items-center gap-2">{submitting && <Spinner size="sm" />}Update Member</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card rounded-xl shadow-xl w-full max-w-sm p-6">
            <div className="text-center">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4"><Trash2 className="w-6 h-6 text-red-600" /></div>
              <h3 className="text-lg font-semibold text-primary mb-2">Delete Member?</h3>
              <p className="text-secondary text-sm mb-6">This action cannot be undone. The member will be permanently removed.</p>
              <div className="flex gap-3"><button onClick={() => setShowDeleteConfirm(null)} className="btn-secondary flex-1">Cancel</button><button onClick={() => handleDeleteMember(showDeleteConfirm)} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition">Delete</button></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}