'use client';

import { useState, useRef, useEffect } from 'react';
import { Upload, Download, MapPin, Users, FileText, CheckCircle, AlertCircle, Plus, Search, X, Save, Trash2, ChevronLeft, ChevronRight, Info } from 'lucide-react';
import { useOrganization } from '@clerk/nextjs';
import Papa from 'papaparse';
import DashboardLayout from '@/components/DashboardLayout';

interface LeadData {
  _id?: string;
  firstName: string;
  lastName: string;
  phone: string;
  companyName?: string;
  jobTitle?: string;
  linkedinUrl?: string;
  email: string;
  notes?: string;
  customFields?: { [key: string]: string | number | boolean };
  integrationIds?: {
    hubspotRecordId?: string;
    salesforceRecordId?: string;
    googleSheetsRowId?: string;
  };
  source: 'csv' | 'google_sheets' | 'salesforce' | 'hubspot' | 'manual';
  createdAt: string;
  listId?: string;
}

interface ListData {
  _id: string;
  name: string;
  description?: string;
  leadCount: number;
  createdAt: string;
}

interface FieldMapping {
  firstName: string;
  lastName: string;
  phone: string;
  companyName: string;
  jobTitle: string;
  linkedinUrl: string;
  email: string;
  notes: string;
}

const defaultFieldMapping: FieldMapping = {
  firstName: '',
  lastName: '',
  phone: '',
  companyName: '',
  jobTitle: '',
  linkedinUrl: '',
  email: '',
  notes: '',
};

export default function LeadsPage() {
  const [csvData, setCsvData] = useState<Record<string, string>[]>([]);
  const [fieldMapping, setFieldMapping] = useState<FieldMapping>(defaultFieldMapping);
  const [mappedData, setMappedData] = useState<LeadData[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [leads, setLeads] = useState<LeadData[]>([]);
  const [lists, setLists] = useState<ListData[]>([]);
  const [selectedList, setSelectedList] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateList, setShowCreateList] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [newListDescription, setNewListDescription] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [sidebarLead, setSidebarLead] = useState<LeadData | null>(null);
  const [isSavingLead, setIsSavingLead] = useState(false);
  const [orgMembers, setOrgMembers] = useState<Array<{ id: string; email: string; name: string }>>([]);
  const [customFieldEntries, setCustomFieldEntries] = useState<Array<{ key: string; value: string }>>([]);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { organization } = useOrganization();

  // Load existing leads and lists on component mount
  useEffect(() => {
    loadLeadsAndLists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, selectedList]);

  // Load organization members for owner dropdown
  useEffect(() => {
    let isMounted = true;
    const loadMembers = async () => {
      try {
        if (!organization) return;
        const memberships = await organization.getMemberships();
        if (!isMounted) return;
        const members = (memberships.data || []).map((m) => {
          const publicUserData = m.publicUserData;
          return {
            id: publicUserData?.userId || '',
            email: (publicUserData as { emailAddress?: string })?.emailAddress || '',
            name: publicUserData?.firstName && publicUserData?.lastName ? `${publicUserData.firstName} ${publicUserData.lastName}` : (publicUserData?.firstName || publicUserData?.lastName || publicUserData?.identifier || 'Member')
          };
        });
        setOrgMembers(members);
      } catch {
        // ignore
      }
    };
    loadMembers();
    return () => { isMounted = false; };
  }, [organization]);

  // Prepare editable custom fields when opening the sidebar
  useEffect(() => {
    if (sidebarLead && sidebarLead.customFields) {
      const entries = Object.entries(sidebarLead.customFields).map(([key, value]) => ({ key, value: valueToString(value) }));
      setCustomFieldEntries(entries);
    } else {
      setCustomFieldEntries([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sidebarLead]);

  const loadLeadsAndLists = async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams({ page: String(page), limit: '50' });
      if (selectedList) params.set('listId', selectedList);
      const response = await fetch(`/api/leads?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setLeads(data.leads || []);
        setLists(data.lists || []);
        if (data.pagination) {
          setTotalPages(data.pagination.totalPages || 1);
        }
        // Reset selection on new page/filter
        setSelectedIds([]);
      }
    } catch (error) {
      console.error('Error loading leads:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportTemplate = async () => {
    try {
      const response = await fetch('/api/leads/export-template');
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'leads_template.csv';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (error) {
      console.error('Error downloading template:', error);
    }
  };

  const handleCreateList = async () => {
    if (!newListName.trim()) return;

    try {
      const response = await fetch('/api/lists', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newListName,
          description: newListDescription,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setLists(prev => [data.list, ...prev]);
        setNewListName('');
        setNewListDescription('');
        setShowCreateList(false);
      }
    } catch (error) {
      console.error('Error creating list:', error);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadStatus('idle');

    Papa.parse(file, {
      header: true,
      complete: (results) => {
        setCsvData(results.data as Record<string, string>[]);
        setIsUploading(false);
        setUploadStatus('success');
      },
      error: (error) => {
        console.error('Error parsing CSV:', error);
        setIsUploading(false);
        setUploadStatus('error');
      },
    });
  };

  const handleFieldMapping = () => {
    if (csvData.length === 0) return;

    const mapped = csvData.map((row) => {
      const lead: LeadData = {
        firstName: row[fieldMapping.firstName] || '',
        lastName: row[fieldMapping.lastName] || '',
        phone: row[fieldMapping.phone] || '',
        companyName: row[fieldMapping.companyName] || undefined,
        jobTitle: row[fieldMapping.jobTitle] || undefined,
        linkedinUrl: row[fieldMapping.linkedinUrl] || undefined,
        email: row[fieldMapping.email] || '',
        notes: row[fieldMapping.notes] || undefined,
        source: 'csv',
        createdAt: new Date().toISOString(),
      };

      // Extract custom fields
      const standardFields = ['firstName', 'lastName', 'phone', 'companyName', 'jobTitle', 'linkedinUrl', 'email', 'notes'];
      const customFields: { [key: string]: string | number | boolean } = {};
      
      Object.keys(row).forEach(key => {
        if (!standardFields.includes(key) && row[key] !== undefined && row[key] !== '') {
          customFields[key] = row[key];
        }
      });

      if (Object.keys(customFields).length > 0) {
        lead.customFields = customFields;
      }

      return lead;
    });

    setMappedData(mapped);
  };

  const handleSaveLeads = async () => {
    try {
      const response = await fetch('/api/leads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          leads: mappedData,
          listId: selectedList || undefined,
          source: 'csv'
        }),
      });

      if (response.ok) {
        alert('Leads saved successfully!');
        setCsvData([]);
        setMappedData([]);
        setFieldMapping(defaultFieldMapping);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        // Reload leads to show the new ones
        loadLeadsAndLists();
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save leads');
      }
    } catch (error) {
      console.error('Error saving leads:', error);
      alert(`Error saving leads: ${error instanceof Error ? error.message : 'Please try again.'}`);
    }
  };

  const toggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(leads.map(l => l._id!).filter(Boolean));
    } else {
      setSelectedIds([]);
    }
  };

  const toggleSelectOne = (id?: string) => {
    if (!id) return;
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Delete ${selectedIds.length} selected lead(s)?`)) return;
    try {
      const res = await fetch('/api/leads', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds })
      });
      if (res.ok) {
        await loadLeadsAndLists();
      }
    } catch (e) {
      console.error('Delete failed', e);
    }
  };

  const listIdToName = (id?: string) => {
    if (!id) return 'CSV Import';
    const list = lists.find(l => l._id === id);
    return list ? list.name : 'CSV Import';
  };

  const formatDate = (iso: string) => {
    try {
      const date = new Date(iso);
      const day = date.getDate().toString().padStart(2, '0');
      const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const month = monthNames[date.getMonth()];
      const year = date.getFullYear();
      return `${day}-${month}-${year}`;
    } catch {
      return iso;
    }
  };

  const saveSidebarLead = async () => {
    if (!sidebarLead || !sidebarLead._id) return;
    setIsSavingLead(true);
    try {
      const customFieldsObject = customFieldEntries.reduce((acc: Record<string, string>, item) => {
        const k = item.key.trim();
        if (k !== '') acc[k] = item.value;
        return acc;
      }, {});
      const res = await fetch('/api/leads', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ _id: sidebarLead._id, update: {
          firstName: sidebarLead.firstName,
          lastName: sidebarLead.lastName,
          email: sidebarLead.email,
          phone: sidebarLead.phone,
          companyName: sidebarLead.companyName,
          jobTitle: sidebarLead.jobTitle,
          linkedinUrl: sidebarLead.linkedinUrl,
          notes: sidebarLead.notes,
          contactOwnerId: (sidebarLead as LeadData & { contactOwnerId?: string }).contactOwnerId
          ,customFields: Object.keys(customFieldsObject).length > 0 ? customFieldsObject : undefined
        } })
      });
      if (res.ok) {
        await loadLeadsAndLists();
        setSidebarLead(null);
      }
    } catch (e) {
      console.error('Update failed', e);
    } finally {
      setIsSavingLead(false);
    }
  };

  const deleteSingleLead = async (id?: string) => {
    if (!id) return;
    if (!confirm('Delete this lead?')) return;
    try {
      const res = await fetch('/api/leads', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [id] }) });
      if (res.ok) {
        await loadLeadsAndLists();
        setSidebarLead(null);
      }
    } catch (e) {
      console.error('Delete failed', e);
    }
  };

  const valueToString = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return formatDate(value.toString());
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  const getCsvHeaders = () => {
    if (csvData.length === 0) return [];
    return Object.keys(csvData[0]);
  };

  const filteredLeads = leads.filter(lead => {
    const matchesSearch = searchTerm === '' || 
      lead.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.companyName?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesList = selectedList === '' || lead.listId === selectedList;
    
    return matchesSearch && matchesList;
  });

  // const getSourceIcon = (source: string) => {
  //   switch (source) {
  //     case 'csv': return <FileText className="w-4 h-4" />;
  //     case 'hubspot': return <div className="w-4 h-4 bg-orange-500 rounded" />;
  //     case 'salesforce': return <div className="w-4 h-4 bg-blue-500 rounded" />;
  //     case 'google_sheets': return <div className="w-4 h-4 bg-green-500 rounded" />;
  //     default: return <Users className="w-4 h-4" />;
  //   }
  // };

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto space-y-6 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Lead Management</h1>
          <p className="text-body-small text-gray-600 mt-1">Manage and import leads from various sources</p>
        </div>
        <div className="flex space-x-3">
          <a
            href="/leads/import"
            className="flex items-center px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors cursor-pointer"
          >
            <Upload className="w-4 h-4 mr-2" />
            <span className="text-body-small font-body-small">Import Leads</span>
          </a>
          <button 
            onClick={handleExportTemplate}
            className="flex items-center px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4 mr-2" />
            <span className="text-body-small font-body-small">Export Template</span>
          </button>
        </div>
      </div>

      {/* Lists and Search Section */}
      <div className="tuco-section p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Your Leads</h2>
          <div className="flex items-center space-x-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
                type="text"
                placeholder="Search leads..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 tuco-input"
              />
            </div>
            <select
              value={selectedList}
              onChange={(e) => { setSelectedList(e.target.value); setPage(1); }}
              className="tuco-select"
            >
              <option value="">All Lists</option>
              {lists.map((list) => (
                <option key={list._id} value={list._id}>
                  {list.name} ({list.leadCount})
                </option>
              ))}
            </select>
            {selectedIds.length > 0 && (
              <button
                onClick={handleDeleteSelected}
                className="flex items-center px-3 py-2 border border-red-300 text-red-700 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4 mr-1" /> Delete ({selectedIds.length})
              </button>
            )}
            <button
              onClick={() => setShowCreateList(true)}
              className="flex shrink-0 items-center px-3 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4 mr-1" />
              <span className="text-body-small font-body-small">New List</span>
            </button>
          </div>
        </div>

        {/* Create List Modal */}
        {showCreateList && (
          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
            <h3 className="font-medium text-gray-900 mb-3">Create New List</h3>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="List name"
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-body-small"
              />
              <input
                type="text"
                placeholder="Description (optional)"
                value={newListDescription}
                onChange={(e) => setNewListDescription(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-body-small"
              />
              <div className="flex space-x-2">
                <button
                  onClick={handleCreateList}
                  className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors cursor-pointer text-body-small font-body-small"
                >
                  Create List
                </button>
                <button
                  onClick={() => {
                    setShowCreateList(false);
                    setNewListName('');
                    setNewListDescription('');
                  }}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer text-body-small font-body-small"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Leads Table */}
        {isLoading ? (
          <div className="text-center py-8">
            <div className="text-gray-500">Loading leads...</div>
          </div>
        ) : filteredLeads.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3"><input type="checkbox" aria-label="Select all" checked={selectedIds.length === leads.length && leads.length > 0} onChange={(e) => toggleSelectAll(e.target.checked)} /></th>
                  <th className="px-6 py-3 text-left text-body-small font-body-small text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-body-small font-body-small text-gray-500 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-body-small font-body-small text-gray-500 uppercase tracking-wider">
                    Phone
                  </th>
                  <th className="px-6 py-3 text-left text-body-small font-body-small text-gray-500 uppercase tracking-wider">
                    Company
                  </th>
                  <th className="px-6 py-3 text-left text-body-small font-body-small text-gray-500 uppercase tracking-wider">
                    List
                  </th>
                  <th className="px-6 py-3 text-left text-body-small font-body-small text-gray-500 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-3 text-right text-body-small font-body-small text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredLeads.map((lead) => (
                  <tr key={lead._id} className="hover:bg-gray-50">
                    <td className="px-6 py-4"><input type="checkbox" checked={selectedIds.includes(lead._id!)} onClick={(e) => e.stopPropagation()} onChange={() => toggleSelectOne(lead._id)} /></td>
                    <td className="px-6 py-4 whitespace-nowrap text-body-small font-body-small text-gray-900 cursor-pointer" onClick={() => setSidebarLead(lead)}>
                      {lead.firstName} {lead.lastName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-body-small text-gray-500 cursor-pointer" onClick={() => setSidebarLead(lead)}>
                      {lead.email}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-body-small text-gray-500 cursor-pointer" onClick={() => setSidebarLead(lead)}>
                      {lead.phone}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-body-small text-gray-500 cursor-pointer" onClick={() => setSidebarLead(lead)}>
                      {lead.companyName || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-body-small text-gray-500 cursor-pointer" onClick={() => setSidebarLead(lead)}>
                      {listIdToName(lead.listId)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-body-small text-gray-500 cursor-pointer" onClick={() => setSidebarLead(lead)}>
                      {formatDate(lead.createdAt)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-body-small text-gray-500 space-x-2">
                      <a href={`sms:${lead.phone}`} className="px-3 py-1 border border-gray-300 rounded-lg hover:bg-gray-50">Send</a>
                      <span className="relative inline-block">
                        <button onClick={() => setOpenMenuId(openMenuId === lead._id ? null : (lead._id || null))} className="px-2 py-1 border border-gray-300 rounded-lg hover:bg-gray-50">•••</button>
                        {openMenuId === lead._id && (
                          <div className="absolute right-0 mt-2 w-44 bg-white border border-gray-200 rounded-lg shadow-lg z-20 text-left">
                            <button onClick={() => { setSidebarLead(lead); setOpenMenuId(null); }} className="w-full text-left px-3 py-2 hover:bg-gray-50">Edit</button>
                            <a href={`sms:${lead.phone}`} className="block px-3 py-2 hover:bg-gray-50">Send iMessage</a>
                            <button onClick={() => { deleteSingleLead(lead._id); setOpenMenuId(null); }} className="w-full text-left px-3 py-2 hover:bg-gray-50 text-red-600">Delete</button>
                          </div>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* Pagination */}
            <div className="flex items-center justify-between mt-4">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="flex items-center px-3 py-2 border border-gray-300 rounded-lg disabled:opacity-50">
                <ChevronLeft className="w-4 h-4 mr-1" /> Prev
              </button>
              <div className="text-gray-600">Page {page} of {totalPages}</div>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="flex items-center px-3 py-2 border border-gray-300 rounded-lg disabled:opacity-50">
                Next <ChevronRight className="w-4 h-4 ml-1" />
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No leads found</h3>
            <p className="text-gray-600 mb-4">
              {searchTerm || selectedList ? 'Try adjusting your search or filter criteria.' : 'Get started by importing your first leads.'}
            </p>
            <a
              href="/leads/import"
              className="inline-flex items-center px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors cursor-pointer"
            >
              <Upload className="w-4 h-4 mr-2" />
              Import Leads
            </a>
          </div>
        )}
      </div>

      {/* Upload Section - show only when no leads */}
      {(!isLoading && leads.length === 0) && (
      <div className="tuco-section p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Upload CSV File</h2>
        
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
          <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Upload your CSV file</h3>
          <p className="text-gray-600 mb-4">
            Drag and drop your CSV file here, or click to browse
          </p>
          
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            className="hidden"
          />
          
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            {isUploading ? 'Uploading...' : 'Choose File'}
          </button>

          {uploadStatus === 'success' && (
            <div className="mt-4 flex items-center justify-center text-green-600">
              <CheckCircle className="w-5 h-5 mr-2" />
              File uploaded successfully! {csvData.length} records found.
            </div>
          )}

          {uploadStatus === 'error' && (
            <div className="mt-4 flex items-center justify-center text-red-600">
              <AlertCircle className="w-5 h-5 mr-2" />
              Error uploading file. Please try again.
            </div>
          )}
        </div>
      </div>
      )}

      {/* Field Mapping */}
      {csvData.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Map Fields</h2>
          <p className="text-body-small text-gray-600 mb-6">
            Map your CSV columns to the lead fields below
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(fieldMapping).map(([field, value]) => (
              <div key={field} className="space-y-2">
                <label className="block text-body-small font-body-small text-gray-700 capitalize">
                  {field.replace(/([A-Z])/g, ' $1').trim()}
                </label>
                <select
                  value={value}
                  onChange={(e) => setFieldMapping(prev => ({ ...prev, [field]: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                >
                  <option value="">Select column...</option>
                  {getCsvHeaders().map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <div className="mt-6 flex space-x-3">
            <button
              onClick={handleFieldMapping}
              className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors cursor-pointer"
            >
              <MapPin className="w-4 h-4 mr-2 inline" />
              Map Fields
            </button>
          </div>
        </div>
      )}

      {/* Preview Mapped Data */}
      {mappedData.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Preview Mapped Data</h2>
          <p className="text-body-small text-gray-600 mb-6">
            Review your mapped data before saving
          </p>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-body-small font-body-small text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-body-small font-body-small text-gray-500 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-body-small font-body-small text-gray-500 uppercase tracking-wider">
                    Company
                  </th>
                  <th className="px-6 py-3 text-left text-body-small font-body-small text-gray-500 uppercase tracking-wider">
                    Job Title
                  </th>
                  <th className="px-6 py-3 text-left text-body-small font-body-small text-gray-500 uppercase tracking-wider">
                    Phone
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {mappedData.slice(0, 10).map((lead, index) => (
                  <tr key={index}>
                    <td className="px-6 py-4 whitespace-nowrap text-body-small font-body-small text-gray-900">
                      {lead.firstName} {lead.lastName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-body-small text-gray-500">
                      {lead.email}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-body-small text-gray-500">
                      {lead.companyName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-body-small text-gray-500">
                      {lead.jobTitle}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-body-small text-gray-500">
                      {lead.phone}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {mappedData.length > 10 && (
            <p className="text-gray-500 text-body-small mt-4">
              Showing first 10 of {mappedData.length} records
            </p>
          )}

          <div className="mt-6 flex space-x-3">
            <button
              onClick={handleSaveLeads}
              className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors cursor-pointer"
            >
              <Users className="w-4 h-4 mr-2 inline" />
              Save {mappedData.length} Leads
            </button>
          </div>
        </div>
      )}

      {/* Integration Options */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">External Integrations</h2>
          <p className="text-body-small text-gray-600 mb-6">
            Connect with external platforms to sync leads automatically
          </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border border-gray-200 rounded-lg p-4 hover:border-primary transition-colors cursor-pointer">
            <div className="flex items-center mb-3">
              <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center mr-3">
                <FileText className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <h3 className="font-medium text-gray-900">HubSpot</h3>
                <p className="text-body-small text-gray-600">Sync leads from HubSpot</p>
              </div>
            </div>
            <button className="w-full px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer">
              Connect HubSpot
            </button>
          </div>

          <div className="border border-gray-200 rounded-lg p-4 hover:border-primary transition-colors cursor-pointer">
            <div className="flex items-center mb-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mr-3">
                <FileText className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h3 className="font-medium text-gray-900">Salesforce</h3>
                <p className="text-body-small text-gray-600">Sync leads from Salesforce</p>
              </div>
            </div>
            <button className="w-full px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer">
              Connect Salesforce
            </button>
          </div>
        </div>
      </div>
      
      {/* Slide-in Lead Sidebar */}
      {sidebarLead && (
        <div className="fixed inset-0 z-50 flex">
          {/* overlay */}
          <div className="flex-1 bg-black/20" onClick={() => setSidebarLead(null)} />
          {/* right drawer */}
          <div className="w-full sm:w-[420px] h-full bg-white border-l border-gray-200 border-0.5 shadow-2xl transform transition-transform translate-x-0">
            <div className="p-4 flex items-center justify-between border-b border-gray-200 border-0.5 bg-white/60 backdrop-blur sticky top-0 z-10">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Edit Lead</h3>
                <div className="text-xs text-gray-500 mt-1 flex items-center"><Info className="w-3 h-3 mr-1" /> Created {formatDate(sidebarLead.createdAt)} · List: {listIdToName(sidebarLead.listId)}</div>
              </div>
              <div className="flex items-center space-x-2">
                <button onClick={() => deleteSingleLead(sidebarLead._id)} className="px-3 py-2 border border-red-300 text-red-700 rounded-lg hover:bg-red-50" title="Delete"><Trash2 className="w-4 h-4" /></button>
                <button onClick={() => setSidebarLead(null)} className="p-2 text-gray-600 hover:text-gray-900"><X className="w-5 h-5" /></button>
              </div>
            </div>
            <div className="p-4 space-y-4 overflow-y-auto h-[calc(100%-112px)]">
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="block text-sm text-gray-700 mb-1">First Name</label>
                  <input value={sidebarLead.firstName} onChange={(e) => setSidebarLead({ ...sidebarLead, firstName: e.target.value })} className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">Last Name</label>
                  <input value={sidebarLead.lastName} onChange={(e) => setSidebarLead({ ...sidebarLead, lastName: e.target.value })} className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">Email</label>
                  <input value={sidebarLead.email} onChange={(e) => setSidebarLead({ ...sidebarLead, email: e.target.value })} className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">Phone</label>
                  <input value={sidebarLead.phone} onChange={(e) => setSidebarLead({ ...sidebarLead, phone: e.target.value })} className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">Company</label>
                  <input value={sidebarLead.companyName || ''} onChange={(e) => setSidebarLead({ ...sidebarLead, companyName: e.target.value })} className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">Job Title</label>
                  <input value={sidebarLead.jobTitle || ''} onChange={(e) => setSidebarLead({ ...sidebarLead, jobTitle: e.target.value })} className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">LinkedIn URL</label>
                  <input value={sidebarLead.linkedinUrl || ''} onChange={(e) => setSidebarLead({ ...sidebarLead, linkedinUrl: e.target.value })} className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">Contact Owner</label>
                  <select
                    value={(sidebarLead as LeadData & { contactOwnerId?: string }).contactOwnerId || ''}
                    onChange={(e) => setSidebarLead({ ...sidebarLead, contactOwnerId: e.target.value } as LeadData & { contactOwnerId?: string })}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">Unassigned</option>
                    {orgMembers.map(m => (
                      <option key={m.id} value={m.id}>{m.name} ({m.email})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">Notes</label>
                  <textarea value={sidebarLead.notes || ''} onChange={(e) => setSidebarLead({ ...sidebarLead, notes: e.target.value })} className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
              </div>

              {/* Additional info */}
              {(sidebarLead.customFields || sidebarLead.integrationIds) && (
                <div className="mt-2">
                  <h4 className="text-sm font-medium text-gray-900 mb-2">Additional Information</h4>
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-2">
                    <div className="text-xs font-medium text-gray-700 mb-2">Custom Fields</div>
                    <div className="space-y-2">
                      {customFieldEntries.map((entry, idx) => (
                        <div key={idx} className="grid grid-cols-2 gap-2">
                          <input className="tuco-input" value={entry.key} onChange={(e) => {
                            const next = [...customFieldEntries];
                            next[idx] = { ...entry, key: e.target.value };
                            setCustomFieldEntries(next);
                          }} placeholder="Field name" />
                          <input className="tuco-input" value={entry.value} onChange={(e) => {
                            const next = [...customFieldEntries];
                            next[idx] = { ...entry, value: e.target.value };
                            setCustomFieldEntries(next);
                          }} placeholder="Value" />
                        </div>
                      ))}
                      <div>
                        <button onClick={() => setCustomFieldEntries(prev => [...prev, { key: '', value: '' }])} className="px-3 py-1 border border-gray-300 rounded-lg hover:bg-gray-50">Add Field</button>
                      </div>
                    </div>
                  </div>
                  {sidebarLead.integrationIds && (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                      <div className="text-xs font-medium text-gray-700 mb-1">Integrations</div>
                      <div className="text-xs text-gray-700 space-y-1">
                        {Object.entries(sidebarLead.integrationIds).map(([k,v]) => (
                          <div key={k} className="flex justify-between"><span className="text-gray-500">{k}</span><span className="ml-4 break-all">{String(v)}</span></div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="p-4 border-t border-gray-200 border-0.5 bg-white flex justify-end sticky bottom-0">
              <div className="space-x-2 flex justify-between items-center w-full">
                <button onClick={() => setSidebarLead(null)} className="px-4 py-2 border rounded-lg">Cancel</button>
                <button onClick={saveSidebarLead} disabled={isSavingLead} className="px-4 py-2 bg-primary text-white rounded-lg disabled:opacity-50 flex items-center"><Save className="w-4 h-4 mr-2" /> {isSavingLead ? 'Updating...' : 'Update'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </DashboardLayout>
  );
}
