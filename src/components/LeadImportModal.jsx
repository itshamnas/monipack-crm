import React, { useState } from 'react';
import { 
  X, 
  Upload, 
  Download, 
  FileSpreadsheet, 
  CheckCircle, 
  AlertCircle, 
  AlertTriangle,
  Building2, 
  Phone, 
  MapPin, 
  UserCheck, 
  DollarSign, 
  Layers, 
  RefreshCw,
  Info,
  Check,
  ShieldAlert
} from 'lucide-react';
import { getApiUrl } from '../api/config.js';

export default function LeadImportModal({
  isOpen,
  onClose,
  token,
  onImportSuccess,
  showToast
}) {
  const [fileName, setFileName] = useState('');
  const [fileContent, setFileContent] = useState('');
  const [parsingLoading, setParsingLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [parsedData, setParsedData] = useState(null);
  const [duplicatePolicy, setDuplicatePolicy] = useState('update'); // 'update', 'skip', 'allow_duplicates'
  const [searchFilter, setSearchFilter] = useState('');

  if (!isOpen) return null;

  const handleAuthError = () => {
    window.dispatchEvent(new CustomEvent('monipack_session_expired'));
    onClose();
  };

  const getAuthHeaders = () => {
    const effectiveToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('monipack_auth_token') : '') || '';
    return effectiveToken ? { Authorization: `Bearer ${effectiveToken}` } : {};
  };

  // 1. Download Official Leads Template (Public template endpoint)
  const handleDownloadTemplate = async (type = 'minimal') => {
    try {
      const res = await fetch(getApiUrl(`/api/leads/template?type=${type}`), {
        headers: getAuthHeaders()
      });
      if (!res.ok) throw new Error('Failed to generate leads template');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const downloadName = type === 'minimal'
        ? 'monipack_leads_quick_template_name_mobile.csv'
        : 'monipack_leads_standard_template.csv';
      link.setAttribute('download', downloadName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      if (showToast) showToast(`${type === 'minimal' ? 'Quick (Name + Mobile)' : 'Standard'} leads template downloaded!`);
    } catch (err) {
      console.error(err);
      if (showToast) showToast('Error downloading leads template.', 'error');
    }
  };

  // 2. Handle File Selection
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setParsingLoading(true);

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result;
      setFileContent(content);

      try {
        const res = await fetch(getApiUrl('/api/leads/parse-csv'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders()
          },
          body: JSON.stringify({ csvData: content })
        });

        if (res.status === 401) {
          handleAuthError();
          return;
        }

        const data = await res.json();
        if (res.ok) {
          setParsedData(data);
          const validNum = data.validCount || 0;
          const invalidNum = data.invalidCount || 0;
          if (showToast) {
            showToast(`Parsed ${data.count} rows: ${validNum} ready for intake${invalidNum > 0 ? `, ${invalidNum} incomplete skipped` : ''}`);
          }
        } else {
          if (showToast) {
            showToast(data.error || 'Failed to parse leads file.', 'error');
          } else {
            alert(data.error || 'Failed to parse leads file.');
          }
        }
      } catch (err) {
        console.error(err);
        if (showToast) showToast('Error parsing uploaded file.', 'error');
      } finally {
        setParsingLoading(false);
      }
    };
    reader.readAsText(file);
  };

  // 3. Commit Bulk Import
  const handleCommitImport = async () => {
    if (!parsedData || !parsedData.items || parsedData.items.length === 0) return;
    
    // Only import valid records (must have Name and Mobile)
    const validItems = parsedData.items.filter(item => item.isValid !== false);
    if (validItems.length === 0) {
      if (showToast) showToast('No valid leads with both Name and Mobile to import.', 'error');
      return;
    }

    setImportLoading(true);

    try {
      const res = await fetch(getApiUrl('/api/leads/bulk-import'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          items: validItems,
          options: { duplicatePolicy }
        })
      });

      if (res.status === 401) {
        handleAuthError();
        return;
      }

      const result = await res.json();
      if (res.ok) {
        if (showToast) {
          showToast(`Import Success: ${result.addedCount} new inquiries in Call Queue, ${result.updatedCount} updated, ${result.skippedCount} skipped!`);
        }
        if (onImportSuccess) {
          onImportSuccess(result);
        }
        handleReset();
        onClose();
      } else {
        if (showToast) {
          showToast(result.error || 'Bulk import failed.', 'error');
        } else {
          alert(result.error || 'Bulk import failed.');
        }
      }
    } catch (err) {
      console.error(err);
      if (showToast) showToast('Failed to execute bulk import.', 'error');
    } finally {
      setImportLoading(false);
    }
  };

  const handleReset = () => {
    setFileName('');
    setFileContent('');
    setParsedData(null);
    setSearchFilter('');
  };

  const itemsToDisplay = (parsedData?.items || []).filter(item => {
    if (!searchFilter) return true;
    const q = searchFilter.toLowerCase();
    return (
      (item.name && item.name.toLowerCase().includes(q)) ||
      (item.mobile && item.mobile.includes(q)) ||
      (item.customerLocation && item.customerLocation.toLowerCase().includes(q)) ||
      (item.branch && item.branch.toLowerCase().includes(q)) ||
      (item.salesman && item.salesman.toLowerCase().includes(q))
    );
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-100 border border-red-200 flex items-center justify-center text-red-600 shadow-2xs">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black text-slate-900">Import Leads & Customer Inquiries</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800 border border-red-200">
                  Excel / CSV 2026 Engine
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Bulk import exhibition attendees, campaign inquiries, and wholesale buyers into Customer Care & Pipeline
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Top Actions: Template Download & Guidelines */}
          <div className="bg-gradient-to-r from-red-50/50 via-slate-50 to-emerald-50/30 border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-900">Official <span className="font-monipack lowercase text-sm">monipack</span> Leads Importer:</span>
                <span className="text-[11px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-bold">Only Name & Mobile Required</span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed max-w-2xl">
                Upload marketing, exhibition, or WhatsApp inquiries. Only <strong>Customer Name</strong> and <strong>Mobile Number (+968)</strong> are needed. Location (Wilayat), Quantity, and Branch assignment will be captured directly in CRM during Customer Care call intake.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => handleDownloadTemplate('minimal')}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition active:scale-95"
                title="Download 2-column CSV with only Name and Mobile Number"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Quick Template (Name + Mobile)</span>
              </button>
              <button
                type="button"
                onClick={() => handleDownloadTemplate('standard')}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl border border-slate-200 transition active:scale-95"
                title="Download full template with optional Wilayat, Quantity, and Notes"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Standard Template</span>
              </button>
            </div>
          </div>

          {/* Upload Dropzone */}
          {!parsedData ? (
            <div className="border-2 border-dashed border-slate-300 hover:border-red-400 rounded-2xl p-8 text-center bg-slate-50/50 hover:bg-red-50/10 transition group">
              <input
                type="file"
                id="leadCsvInput"
                accept=".csv, .txt, text/csv"
                onChange={handleFileUpload}
                className="hidden"
              />
              <label
                htmlFor="leadCsvInput"
                className="cursor-pointer flex flex-col items-center justify-center space-y-3"
              >
                <div className="w-14 h-14 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-600 group-hover:text-red-600 group-hover:scale-105 transition">
                  <Upload className="w-7 h-7" />
                </div>
                <div>
                  <span className="text-sm font-bold text-slate-800 block">
                    Click to browse or drag and drop your Leads CSV
                  </span>
                  <span className="text-xs text-slate-400 block mt-1">
                    Supports Microsoft Excel CSV, Google Sheets CSV, and export lists
                  </span>
                </div>
                <div className="pt-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 shadow-2xs">
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                    Browse CSV File
                  </span>
                </div>
              </label>
              {parsingLoading && (
                <div className="mt-4 flex items-center justify-center gap-2 text-xs text-red-600 font-semibold">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Analyzing headers, validating Oman phones, and detecting duplicates...
                </div>
              )}
            </div>
          ) : (
            /* Parsed Summary & Options */
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">File Loaded</span>
                  <span className="text-xs font-bold text-slate-800 truncate block mt-0.5" title={fileName}>
                    {fileName}
                  </span>
                  <span className="text-[11px] text-slate-500 font-mono mt-1 block">
                    {parsedData.count} total rows
                  </span>
                </div>

                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 block">Ready for Call Intake</span>
                  <span className="text-xl font-black text-emerald-700 block mt-0.5">
                    {parsedData.validCount}
                  </span>
                  <span className="text-[11px] text-emerald-600 mt-1 block">
                    Valid Name & Mobile
                  </span>
                </div>

                {parsedData.invalidCount > 0 ? (
                  <div className="bg-rose-50 border border-rose-200 rounded-xl p-3.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-rose-600 block">Incomplete (Skipped)</span>
                    <span className="text-xl font-black text-rose-700 block mt-0.5">
                      {parsedData.invalidCount}
                    </span>
                    <span className="text-[11px] text-rose-600 mt-1 block">
                      Missing Name or Phone
                    </span>
                  </div>
                ) : (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700 block">Duplicates Flagged</span>
                    <span className="text-xl font-black text-amber-800 block mt-0.5">
                      {parsedData.duplicatesCount}
                    </span>
                    <span className="text-[11px] text-amber-700 mt-1 block">
                      Matches existing mobile
                    </span>
                  </div>
                )}

                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5 flex flex-col justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-blue-700 block">Intake Queue</span>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-blue-900 mt-1">
                    <Headphones className="w-3.5 h-3.5 text-blue-600" />
                    <span>Customer Care Desk</span>
                  </div>
                  <button
                    onClick={handleReset}
                    className="text-[11px] text-slate-500 hover:text-red-600 font-bold self-start mt-2 transition"
                  >
                    Upload Another File
                  </button>
                </div>
              </div>

              {/* Duplicate Strategy Controls */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 text-amber-600" />
                    Duplicate Handling Policy for Matching Leads:
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 pt-1">
                  <label className={`flex items-start gap-2.5 p-3 rounded-xl border text-xs cursor-pointer transition ${
                    duplicatePolicy === 'update' ? 'bg-white border-red-500 shadow-xs ring-1 ring-red-500/20' : 'bg-white/60 border-slate-200 hover:bg-white'
                  }`}>
                    <input
                      type="radio"
                      name="dupPolicy"
                      checked={duplicatePolicy === 'update'}
                      onChange={() => setDuplicatePolicy('update')}
                      className="mt-0.5 text-red-600 focus:ring-red-500"
                    />
                    <div>
                      <span className="font-bold text-slate-900 block">Update Existing Leads (Recommended)</span>
                      <span className="text-[11px] text-slate-500 block mt-0.5">
                        Merges new notes and inquiries without duplicating the lead.
                      </span>
                    </div>
                  </label>

                  <label className={`flex items-start gap-2.5 p-3 rounded-xl border text-xs cursor-pointer transition ${
                    duplicatePolicy === 'skip' ? 'bg-white border-red-500 shadow-xs ring-1 ring-red-500/20' : 'bg-white/60 border-slate-200 hover:bg-white'
                  }`}>
                    <input
                      type="radio"
                      name="dupPolicy"
                      checked={duplicatePolicy === 'skip'}
                      onChange={() => setDuplicatePolicy('skip')}
                      className="mt-0.5 text-red-600 focus:ring-red-500"
                    />
                    <div>
                      <span className="font-bold text-slate-900 block">Skip Duplicates</span>
                      <span className="text-[11px] text-slate-500 block mt-0.5">
                        Only import genuinely new contacts. Leaves existing records untouched.
                      </span>
                    </div>
                  </label>

                  <label className={`flex items-start gap-2.5 p-3 rounded-xl border text-xs cursor-pointer transition ${
                    duplicatePolicy === 'allow_duplicates' ? 'bg-white border-red-500 shadow-xs ring-1 ring-red-500/20' : 'bg-white/60 border-slate-200 hover:bg-white'
                  }`}>
                    <input
                      type="radio"
                      name="dupPolicy"
                      checked={duplicatePolicy === 'allow_duplicates'}
                      onChange={() => setDuplicatePolicy('allow_duplicates')}
                      className="mt-0.5 text-red-600 focus:ring-red-500"
                    />
                    <div>
                      <span className="font-bold text-slate-900 block">Import All as New</span>
                      <span className="text-[11px] text-slate-500 block mt-0.5">
                        Creates fresh inquiry records even if the phone number already exists.
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Table Search Filter */}
              <div className="flex items-center justify-between gap-4 pt-2">
                <span className="text-xs font-bold text-slate-700">
                  Pre-Commit Preview ({itemsToDisplay.length} of {parsedData.count} shown)
                </span>
                <input
                  type="text"
                  placeholder="Filter preview by name, phone..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs w-64 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                />
              </div>

              {/* Preview Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100 text-slate-600 sticky top-0 font-semibold border-b border-slate-200 z-10">
                    <tr>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Company / Customer</th>
                      <th className="py-2.5 px-3">Mobile (+968)</th>
                      <th className="py-2.5 px-3">Wilayat / Location</th>
                      <th className="py-2.5 px-3">Quantity</th>
                      <th className="py-2.5 px-3">Stage</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-normal text-slate-700">
                    {itemsToDisplay.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/80 transition">
                        <td className="py-2 px-3">
                          {item.isValid === false ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200" title={item.errorReason}>
                              <AlertCircle className="w-2.5 h-2.5" />
                              {item.errorReason}
                            </span>
                          ) : item.isDuplicate ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200" title={item.duplicateReason}>
                              <AlertTriangle className="w-2.5 h-2.5" />
                              Duplicate
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              <Check className="w-2.5 h-2.5" />
                              Ready for Intake
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          <span className="font-bold text-slate-900 block">{item.name}</span>
                          {item.contactPerson && (
                            <span className="text-[10px] text-slate-400 block">{item.contactPerson}</span>
                          )}
                        </td>
                        <td className="py-2 px-3 font-mono text-[11px]">
                          <span className="text-slate-900 font-semibold">{item.phone || item.mobile || 'No Phone'}</span>
                          {item.phoneValid && (
                            <span className="ml-1 text-[9px] text-emerald-600 font-bold">✓ OM</span>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          {item.customerLocation === 'Needs Intake' ? (
                            <span className="px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded text-[10px] font-bold">
                              📍 Needs Intake
                            </span>
                          ) : (
                            <span className="text-slate-700 font-medium">{item.customerLocation}</span>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          {item.quantity === 'Needs Intake' ? (
                            <span className="px-2 py-0.5 bg-blue-50 text-blue-800 border border-blue-200 rounded text-[10px] font-bold">
                              📦 Needs Intake
                            </span>
                          ) : (
                            <span className="text-slate-700 font-medium">{item.quantity}</span>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">
                            Step 1: Call Queue
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200/50 rounded-lg transition"
          >
            Cancel
          </button>

          {parsedData && (
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-500">
                Ready to import: <strong>{parsedData.validCount || 0}</strong> valid inquiries
              </span>
              <button
                onClick={handleCommitImport}
                disabled={importLoading || !parsedData.validCount}
                className="flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-sm shadow-red-900/20 transition active:scale-95"
              >
                {importLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Importing into Customer Care...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    <span>Commit {parsedData.validCount} Inquiries to Call Queue</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
