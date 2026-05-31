import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import { Upload, Download, FileSpreadsheet, X } from 'lucide-react';

interface BulkCallData {
  user_id: string;
  user_email: string;
  user_name: string;
  date: string;
  call_attempts: number;
  talk_time_seconds: number;
  notes?: string;
}

interface Props {
  onSuccess: () => void;
  onCancel: () => void;
}

export default function BulkCallImport({ onSuccess, onCancel }: Props) {
  const { profile } = useAuthStore();
  const [uploading, setUploading] = useState(false);
  const [previewData, setPreviewData] = useState<BulkCallData[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Download template
  const downloadTemplate = () => {
    const template = [
      {
        'User Email': 'sourabh@example.com',
        'Date': '2026-05-31',
        'Call Attempts': 25,
        'Talk Time (seconds)': 1800,
        'Notes': 'Good performance'
      },
      {
        'User Email': 'argha@example.com',
        'Date': '2026-05-31',
        'Call Attempts': 15,
        'Talk Time (seconds)': 1200,
        'Notes': 'Need improvement'
      }
    ];
    
    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Call Logs Template');
    XLSX.writeFile(wb, 'call_logs_template.xlsx');
    toast.success('Template downloaded');
  };

  // Process uploaded file
  const processFile = async (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet);
      
      // Get all team members for email lookup
      const { data: members } = await supabase
        .from('profiles')
        .select('id, email, full_name')
        .eq('is_active', true);
      
      const memberMap = new Map();
      members?.forEach(m => {
        memberMap.set(m.email.toLowerCase(), m);
        memberMap.set(m.full_name?.toLowerCase(), m);
      });
      
      const processedData: BulkCallData[] = [];
      const errors: string[] = [];
      
      for (const row of rows as any[]) {
        const emailOrName = row['User Email'] || row['User Name'] || row['Team Member'];
        const member = memberMap.get(emailOrName?.toLowerCase());
        
        if (!member) {
          errors.push(`User not found: ${emailOrName}`);
          continue;
        }
        
        const date = row['Date'] || row['Call Date'];
        if (!date) {
          errors.push(`Missing date for: ${emailOrName}`);
          continue;
        }
        
        processedData.push({
          user_id: member.id,
          user_email: member.email,
          user_name: member.full_name,
          date: new Date(date).toISOString().split('T')[0],
          call_attempts: Number(row['Call Attempts'] || row['Calls'] || 0),
          talk_time_seconds: Number(row['Talk Time (seconds)'] || row['Talk Time'] || 0),
          notes: row['Notes'] || ''
        });
      }
      
      if (errors.length > 0) {
        toast.error(`Errors: ${errors.slice(0, 3).join(', ')}`);
      }
      
      setPreviewData(processedData);
    };
    reader.readAsArrayBuffer(file);
  };

  // Upload to database
  const handleUpload = async () => {
    setUploading(true);
    try {
      const callLogs = previewData.map(item => ({
        user_id: item.user_id,
        called_at: `${item.date} 00:00:00`,
        duration_seconds: item.talk_time_seconds,
        call_attempts: item.call_attempts,
        notes: item.notes,
        created_by: profile?.id
      }));
      
      const { error } = await supabase.from('call_logs').insert(callLogs);
      
      if (error) throw error;
      
      toast.success(`Successfully imported ${callLogs.length} records`);
      onSuccess();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="card max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center p-4 border-b border-border">
          <h2 className="text-xl font-semibold text-primary">Bulk Import Call Logs</h2>
          <button onClick={onCancel} className="p-1 rounded-lg hover:bg-secondary">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-4 space-y-4">
          {/* Template Download */}
          <div className="bg-secondary rounded-lg p-4">
            <h3 className="text-sm font-medium text-primary mb-2">Step 1: Download Template</h3>
            <button onClick={downloadTemplate} className="btn-secondary flex items-center gap-2">
              <Download className="w-4 h-4" />
              Download Excel Template
            </button>
          </div>
          
          {/* File Upload */}
          <div className="bg-secondary rounded-lg p-4">
            <h3 className="text-sm font-medium text-primary mb-2">Step 2: Upload Filled Template</h3>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  setSelectedFile(file);
                  processFile(file);
                }
              }}
              className="w-full text-sm text-muted file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-primary file:text-white hover:file:bg-primary/90 cursor-pointer"
            />
          </div>
          
          {/* Preview */}
          {previewData.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-primary mb-2">
                Step 3: Preview ({previewData.length} records)
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-secondary">
                    <tr>
                      <th className="p-2 text-left">Team Member</th>
                      <th className="p-2 text-left">Date</th>
                      <th className="p-2 text-left">Calls</th>
                      <th className="p-2 text-left">Talk Time (sec)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.slice(0, 10).map((item, i) => (
                      <tr key={i} className="border-b border-border">
                        <td className="p-2">{item.user_name}</td>
                        <td className="p-2">{item.date}</td>
                        <td className="p-2">{item.call_attempts}</td>
                        <td className="p-2">{item.talk_time_seconds}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {previewData.length > 10 && (
                  <p className="text-xs text-muted mt-2">+ {previewData.length - 10} more records</p>
                )}
              </div>
            </div>
          )}
        </div>
        
        {/* Actions */}
        <div className="flex justify-end gap-3 p-4 border-t border-border">
          <button onClick={onCancel} className="btn-ghost px-4 py-2">
            Cancel
          </button>
          <button 
            onClick={handleUpload} 
            disabled={previewData.length === 0 || uploading}
            className="btn-primary flex items-center gap-2"
          >
            <Upload className="w-4 h-4" />
            {uploading ? 'Importing...' : `Import ${previewData.length} Records`}
          </button>
        </div>
      </div>
    </div>
  );
}