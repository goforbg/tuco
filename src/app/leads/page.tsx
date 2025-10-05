'use client';

import { useState, useRef, useEffect } from 'react';
import { Upload, Download, MapPin, Users, FileText, CheckCircle, AlertCircle, Plus, Search } from 'lucide-react';
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load existing leads and lists on component mount
  useEffect(() => {
    loadLeadsAndLists();
  }, []);

  const loadLeadsAndLists = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/leads');
      if (response.ok) {
        const data = await response.json();
        setLeads(data.leads || []);
        setLists(data.lists || []);
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

  const getSourceIcon = (source: string) => {
    switch (source) {
      case 'csv': return <FileText className="w-4 h-4" />;
      case 'hubspot': return <div className="w-4 h-4 bg-orange-500 rounded" />;
      case 'salesforce': return <div className="w-4 h-4 bg-blue-500 rounded" />;
      case 'google_sheets': return <div className="w-4 h-4 bg-green-500 rounded" />;
      default: return <Users className="w-4 h-4" />;
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto space-y-6">
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
      <div className="bg-white rounded-lg border border-gray-200 p-6">
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
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-body-small"
              />
            </div>
            <select
              value={selectedList}
              onChange={(e) => setSelectedList(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-body-small"
            >
              <option value="">All Lists</option>
              {lists.map((list) => (
                <option key={list._id} value={list._id}>
                  {list.name} ({list.leadCount})
                </option>
              ))}
            </select>
            <button
              onClick={() => setShowCreateList(true)}
              className="flex items-center px-3 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors cursor-pointer"
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
                    Source
                  </th>
                  <th className="px-6 py-3 text-left text-body-small font-body-small text-gray-500 uppercase tracking-wider">
                    Created
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredLeads.map((lead) => (
                  <tr key={lead._id}>
                    <td className="px-6 py-4 whitespace-nowrap text-body-small font-body-small text-gray-900">
                      {lead.firstName} {lead.lastName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-body-small text-gray-500">
                      {lead.email}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-body-small text-gray-500">
                      {lead.phone}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-body-small text-gray-500">
                      {lead.companyName || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-body-small text-gray-500">
                      <div className="flex items-center">
                        {getSourceIcon(lead.source)}
                        <span className="ml-2 capitalize">{lead.source.replace('_', ' ')}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-body-small text-gray-500">
                      {new Date(lead.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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

      {/* Upload Section */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
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
      </div>
    </DashboardLayout>
  );
}
