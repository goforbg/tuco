'use client';

import { useState, useRef } from 'react';
import { 
  Upload, 
  Download, 
  FileText, 
  Database, 
  CheckCircle, 
  AlertCircle,
  ArrowRight,
  Zap,
  Users,
  ChevronRight,
  ChevronLeft,
  MapPin,
  Eye,
  Save,
  ArrowLeft
} from 'lucide-react';
import Papa from 'papaparse';
import DashboardLayout from '@/components/DashboardLayout';

interface ImportOption {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bgColor: string;
  features: string[];
  action: string;
  premium?: boolean;
}

interface FieldMapping {
  [key: string]: string;
}

interface ProcessedLead {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  companyName?: string;
  jobTitle?: string;
  linkedinUrl?: string;
  notes?: string;
  customFields?: { [key: string]: string | number | boolean };
}

const importOptions: ImportOption[] = [
  {
    id: 'csv',
    title: 'CSV File',
    description: 'Upload a CSV file with your lead data',
    icon: FileText,
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
    features: ['Drag & drop upload', 'Field mapping', 'Data validation', 'Preview before import'],
    action: 'Upload CSV',
  },
  {
    id: 'google-sheets',
    title: 'Google Sheets',
    description: 'Import directly from Google Sheets',
    icon: Database,
    color: 'text-green-600',
    bgColor: 'bg-green-100',
    features: ['Real-time sync', 'Automatic updates', 'Collaborative editing', 'Version history'],
    action: 'Connect Google Sheets',
  },
  {
    id: 'hubspot',
    title: 'HubSpot',
    description: 'Sync leads from your HubSpot CRM',
    icon: Zap,
    color: 'text-orange-600',
    bgColor: 'bg-orange-100',
    features: ['Bidirectional sync', 'Contact properties', 'Deal tracking', 'Activity logs'],
    action: 'Connect HubSpot',
    premium: true,
  },
  {
    id: 'salesforce',
    title: 'Salesforce',
    description: 'Import leads from Salesforce CRM',
    icon: Users,
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
    features: ['Lead & Contact sync', 'Custom fields', 'Campaign tracking', 'Opportunity data'],
    action: 'Connect Salesforce',
    premium: true,
  },
];

const requiredFields = [
  { key: 'firstName', label: 'First Name', required: true },
  { key: 'lastName', label: 'Last Name', required: true },
  { key: 'email', label: 'Email', required: true },
  { key: 'phone', label: 'Phone', required: true },
  { key: 'companyName', label: 'Company Name', required: false },
  { key: 'jobTitle', label: 'Job Title', required: false },
  { key: 'linkedinUrl', label: 'LinkedIn URL', required: false },
  { key: 'notes', label: 'Notes', required: false },
];

export default function LeadsImportPage() {
  // Step management
  const [currentStep, setCurrentStep] = useState<'select' | 'upload' | 'mapping' | 'preview' | 'confirm' | 'complete'>('select');
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  
  // CSV processing
  const [csvData, setCsvData] = useState<Record<string, string>[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [fieldMapping, setFieldMapping] = useState<FieldMapping>({});
  const [processedLeads, setProcessedLeads] = useState<ProcessedLead[]>([]);
  const [fileName, setFileName] = useState<string>('');
  
  // UI states
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [importSummary, setImportSummary] = useState<{ savedCount: number; invalidCount: number; listName?: string } | null>(null);
  
  // Lists selection
  const [lists, setLists] = useState<Array<{ _id: string; name: string }>>([]);
  const [selectedListId, setSelectedListId] = useState<string>('');
  const [listMode, setListMode] = useState<'existing' | 'new'>('existing');
  const [newListName, setNewListName] = useState('');
  
  // Integration states
  const [integrationCredentials, setIntegrationCredentials] = useState<{
    apiKey: string;
    accessToken: string;
    accountId: string;
    workspaceId: string;
  }>({
    apiKey: '',
    accessToken: '',
    accountId: '',
    workspaceId: '',
  });
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset function
  const resetImport = () => {
    setCurrentStep('select');
    setSelectedOption(null);
    setCsvData([]);
    setCsvHeaders([]);
    setFieldMapping({});
    setProcessedLeads([]);
    setFileName('');
    setIsUploading(false);
    setIsProcessing(false);
    setIsSaving(false);
    setUploadStatus('idle');
    setErrorMessage('');
    setImportSummary(null);
    setSelectedListId('');
    setNewListName('');
    setIntegrationCredentials({
      apiKey: '',
      accessToken: '',
      accountId: '',
      workspaceId: '',
    });
    setIsConnecting(false);
    setConnectionStatus('idle');
  };

  // Load lists when entering upload step
  const loadLists = async () => {
    try {
      const res = await fetch('/api/lists');
      if (res.ok) {
        const data = await res.json();
        const fetched = (data.lists || []).map((l: { _id: string; name: string }) => ({ _id: l._id, name: l.name }));
        setLists(fetched);
        // Default list mode based on availability
        if (fetched.length === 0) {
          setListMode('new');
        } else {
          setListMode('existing');
        }
      }
    } catch {
      // ignore
    }
  };

  // Handle option selection
  const handleOptionSelect = (optionId: string) => {
    setSelectedOption(optionId);
    if (optionId === 'csv') {
      setCurrentStep('upload');
      loadLists();
    } else {
      setCurrentStep('upload'); // For integrations, we'll show their setup
    }
  };

  // Handle file upload
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setErrorMessage('Please select a CSV file.');
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setErrorMessage('File size too large. Please select a file smaller than 10MB.');
      return;
    }

    setFileName(file.name);
    setIsUploading(true);
    setUploadStatus('idle');
    setErrorMessage('');

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim().replace(/"/g, ''),
      transform: (value) => value.trim(),
      complete: (results) => {
        try {
          if (!results.data || results.data.length === 0) {
            setIsUploading(false);
            setUploadStatus('error');
            setErrorMessage('No data found in CSV file.');
            return;
          }

          // Filter out completely empty rows
          const validData = (results.data as Record<string, string>[]).filter((row: Record<string, string>) => {
            return Object.values(row).some(value => 
              value !== undefined && value !== null && value !== '' && 
              (typeof value !== 'string' || value.trim() !== '')
            );
          });

          if (validData.length === 0) {
            setIsUploading(false);
            setUploadStatus('error');
            setErrorMessage('No valid data rows found in CSV file.');
            return;
          }

          const headers = Object.keys(validData[0] as Record<string, string>);
          
          // Check for duplicate headers
          const uniqueHeaders = new Set(headers);
          if (uniqueHeaders.size !== headers.length) {
            setIsUploading(false);
            setUploadStatus('error');
            setErrorMessage('CSV file has duplicate column headers.');
            return;
          }

          setCsvData(validData);
          setCsvHeaders(headers);
        setIsUploading(false);
        setUploadStatus('success');
          
          // Auto-map fields after successful upload
          setTimeout(() => {
            const mapping: FieldMapping = {};
            
            headers.forEach(header => {
              const lowerHeader = header.toLowerCase().trim();
              const normalizedHeader = lowerHeader.replace(/[_\s-]/g, ''); // Remove spaces, underscores, dashes
              
              // Enhanced matching for firstName
              if (
                normalizedHeader === 'firstname' ||
                normalizedHeader === 'first_name' ||
                normalizedHeader === 'firstname' ||
                lowerHeader.includes('first') && lowerHeader.includes('name') ||
                lowerHeader === 'fname' ||
                lowerHeader === 'givenname'
              ) {
                mapping.firstName = header;
              }
              // Enhanced matching for lastName
              else if (
                normalizedHeader === 'lastname' ||
                normalizedHeader === 'last_name' ||
                normalizedHeader === 'lastname' ||
                lowerHeader.includes('last') && lowerHeader.includes('name') ||
                lowerHeader === 'lname' ||
                lowerHeader === 'surname' ||
                lowerHeader === 'familyname'
              ) {
                mapping.lastName = header;
              }
              // Enhanced matching for email
              else if (
                normalizedHeader === 'email' ||
                normalizedHeader === 'emailaddress' ||
                lowerHeader.includes('email') ||
                lowerHeader === 'e_mail' ||
                lowerHeader === 'mail'
              ) {
                mapping.email = header;
              }
              // Enhanced matching for phone
              else if (
                normalizedHeader === 'phone' ||
                normalizedHeader === 'phonenumber' ||
                normalizedHeader === 'phone_number' ||
                lowerHeader.includes('phone') ||
                lowerHeader.includes('mobile') ||
                lowerHeader.includes('cell') ||
                lowerHeader === 'tel' ||
                lowerHeader === 'telephone' ||
                lowerHeader === 'contactnumber'
              ) {
                mapping.phone = header;
              }
              // Enhanced matching for company
              else if (
                normalizedHeader === 'company' ||
                normalizedHeader === 'companyname' ||
                normalizedHeader === 'company_name' ||
                lowerHeader.includes('company') ||
                lowerHeader === 'organization' ||
                lowerHeader === 'org' ||
                lowerHeader === 'employer' ||
                lowerHeader === 'business'
              ) {
                mapping.companyName = header;
              }
              // Enhanced matching for job title
              else if (
                normalizedHeader === 'title' ||
                normalizedHeader === 'jobtitle' ||
                normalizedHeader === 'job_title' ||
                lowerHeader.includes('title') ||
                lowerHeader.includes('position') ||
                lowerHeader === 'role' ||
                lowerHeader === 'designation' ||
                lowerHeader === 'occupation'
              ) {
                mapping.jobTitle = header;
              }
              // Enhanced matching for LinkedIn
              else if (
                normalizedHeader === 'linkedin' ||
                normalizedHeader === 'linkedinurl' ||
                normalizedHeader === 'linkedin_url' ||
                lowerHeader.includes('linkedin') ||
                lowerHeader === 'li_url' ||
                lowerHeader === 'linkedinprofile'
              ) {
                mapping.linkedinUrl = header;
              }
              // Enhanced matching for notes
              else if (
                normalizedHeader === 'notes' ||
                normalizedHeader === 'note' ||
                lowerHeader.includes('note') ||
                lowerHeader.includes('comment') ||
                lowerHeader === 'description' ||
                lowerHeader === 'remarks' ||
                lowerHeader === 'additionalinfo'
              ) {
                mapping.notes = header;
              }
            });
            
            setFieldMapping(mapping);
          }, 100);
          
          setCurrentStep('mapping');
        } catch (error) {
          setIsUploading(false);
          setUploadStatus('error');
          setErrorMessage(`Error processing CSV data: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      },
      error: (error) => {
        console.error('Error parsing CSV:', error);
        setIsUploading(false);
        setUploadStatus('error');
        setErrorMessage('Error parsing CSV file. Please check the format and try again.');
      },
    });
  };

  // Auto-map fields based on header names
  const autoMapFields = () => {
    const mapping: FieldMapping = {};
    
    csvHeaders.forEach(header => {
      const lowerHeader = header.toLowerCase().trim();
      const normalizedHeader = lowerHeader.replace(/[_\s-]/g, ''); // Remove spaces, underscores, dashes
      
      // Enhanced matching for firstName
      if (
        normalizedHeader === 'firstname' ||
        normalizedHeader === 'first_name' ||
        normalizedHeader === 'firstname' ||
        lowerHeader.includes('first') && lowerHeader.includes('name') ||
        lowerHeader === 'fname' ||
        lowerHeader === 'givenname'
      ) {
        mapping.firstName = header;
      }
      // Enhanced matching for lastName
      else if (
        normalizedHeader === 'lastname' ||
        normalizedHeader === 'last_name' ||
        normalizedHeader === 'lastname' ||
        lowerHeader.includes('last') && lowerHeader.includes('name') ||
        lowerHeader === 'lname' ||
        lowerHeader === 'surname' ||
        lowerHeader === 'familyname'
      ) {
        mapping.lastName = header;
      }
      // Enhanced matching for email
      else if (
        normalizedHeader === 'email' ||
        normalizedHeader === 'emailaddress' ||
        lowerHeader.includes('email') ||
        lowerHeader === 'e_mail' ||
        lowerHeader === 'mail'
      ) {
        mapping.email = header;
      }
      // Enhanced matching for phone
      else if (
        normalizedHeader === 'phone' ||
        normalizedHeader === 'phonenumber' ||
        normalizedHeader === 'phone_number' ||
        lowerHeader.includes('phone') ||
        lowerHeader.includes('mobile') ||
        lowerHeader.includes('cell') ||
        lowerHeader === 'tel' ||
        lowerHeader === 'telephone' ||
        lowerHeader === 'contactnumber'
      ) {
        mapping.phone = header;
      }
      // Enhanced matching for company
      else if (
        normalizedHeader === 'company' ||
        normalizedHeader === 'companyname' ||
        normalizedHeader === 'company_name' ||
        lowerHeader.includes('company') ||
        lowerHeader === 'organization' ||
        lowerHeader === 'org' ||
        lowerHeader === 'employer' ||
        lowerHeader === 'business'
      ) {
        mapping.companyName = header;
      }
      // Enhanced matching for job title
      else if (
        normalizedHeader === 'title' ||
        normalizedHeader === 'jobtitle' ||
        normalizedHeader === 'job_title' ||
        lowerHeader.includes('title') ||
        lowerHeader.includes('position') ||
        lowerHeader === 'role' ||
        lowerHeader === 'designation' ||
        lowerHeader === 'occupation'
      ) {
        mapping.jobTitle = header;
      }
      // Enhanced matching for LinkedIn
      else if (
        normalizedHeader === 'linkedin' ||
        normalizedHeader === 'linkedinurl' ||
        normalizedHeader === 'linkedin_url' ||
        lowerHeader.includes('linkedin') ||
        lowerHeader === 'li_url' ||
        lowerHeader === 'linkedinprofile'
      ) {
        mapping.linkedinUrl = header;
      }
      // Enhanced matching for notes
      else if (
        normalizedHeader === 'notes' ||
        normalizedHeader === 'note' ||
        lowerHeader.includes('note') ||
        lowerHeader.includes('comment') ||
        lowerHeader === 'description' ||
        lowerHeader === 'remarks' ||
        lowerHeader === 'additionalinfo'
      ) {
        mapping.notes = header;
      }
    });
    
    setFieldMapping(mapping);
  };

  // Format phone number to ensure country code and proper format
  const formatPhoneNumber = (phone: string): string => {
    if (!phone) return '';
    // Always strip non-digits first
    const digitsOnly = phone.replace(/\D/g, '');
    // US/Canada with leading 1 and 11 digits
    if (digitsOnly.length === 11 && digitsOnly.startsWith('1')) {
      return `+${digitsOnly}`;
    }
    // 10 digits -> assume US
    if (digitsOnly.length === 10) {
      return `+1${digitsOnly}`;
    }
    // If we have 11-15 digits with no leading plus, prefix '+'
    if (digitsOnly.length >= 11 && digitsOnly.length <= 15) {
      return `+${digitsOnly}`;
    }
    // Otherwise return as-is cleaned (may be invalid and caught by validator)
    return digitsOnly ? `+${digitsOnly}` : '';
  };

  // Format email to ensure proper format
  const formatEmail = (email: string): string => {
    if (!email) return '';
    
    // Remove extra whitespace and convert to lowercase
    const cleaned = email.trim().toLowerCase();
    
    // Basic email validation - if it looks like an email, return it
    if (cleaned.includes('@') && cleaned.includes('.')) {
      return cleaned;
    }
    
    return cleaned;
  };

  // Validate email format
  const isValidEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  // Validate phone format
  const isValidPhone = (phone: string): boolean => {
    const phoneRegex = /^\+[1-9]\d{1,14}$/;
    return phoneRegex.test(phone);
  };

  // Check if row is empty
  const isEmptyRow = (row: Record<string, string>): boolean => {
    return Object.values(row).every(value => 
      value === undefined || value === null || value === '' || 
      (typeof value === 'string' && value.trim() === '')
    );
  };

  // Process leads based on mapping
  const processLeads = () => {
    setIsProcessing(true);
    setErrorMessage('');
    
    try {
      const processed: ProcessedLead[] = [];
      const duplicates = new Set<string>();
      const errors: string[] = [];
      let emptyRows = 0;
      let malformedRows = 0;

      csvData.forEach((row, index) => {
        const rowNumber = index + 2; // +2 because index is 0-based and we skip header row
        
        // Skip empty rows
        if (isEmptyRow(row)) {
          emptyRows++;
          return;
        }

        const firstName = (row[fieldMapping.firstName] || '').trim();
        const lastName = (row[fieldMapping.lastName] || '').trim();
        const email = formatEmail(row[fieldMapping.email] || '');
        const phone = formatPhoneNumber(row[fieldMapping.phone] || '');

        // Validate required fields
        if (!firstName || !lastName || !email || !phone) {
          errors.push(`Row ${rowNumber}: Missing required fields (firstName, lastName, email, or phone)`);
          malformedRows++;
          return;
        }

        // Validate email format
        if (!isValidEmail(email)) {
          errors.push(`Row ${rowNumber}: Invalid email format - ${email}`);
          malformedRows++;
          return;
        }

        // Validate phone format
        if (!isValidPhone(phone)) {
          errors.push(`Row ${rowNumber}: Invalid phone format - ${phone}`);
          malformedRows++;
          return;
        }

        // Check for duplicates based on email
        const duplicateKey = email.toLowerCase();
        if (duplicates.has(duplicateKey)) {
          errors.push(`Row ${rowNumber}: Duplicate email found - ${email}`);
          return;
        }
        duplicates.add(duplicateKey);

        const lead: ProcessedLead = {
          firstName,
          lastName,
          email,
          phone,
          companyName: fieldMapping.companyName ? (row[fieldMapping.companyName] || '').trim() : undefined,
          jobTitle: fieldMapping.jobTitle ? (row[fieldMapping.jobTitle] || '').trim() : undefined,
          linkedinUrl: fieldMapping.linkedinUrl ? (row[fieldMapping.linkedinUrl] || '').trim() : undefined,
          notes: fieldMapping.notes ? (row[fieldMapping.notes] || '').trim() : undefined,
        };

        // Extract custom fields (only non-empty values)
        const customFields: { [key: string]: string | number | boolean } = {};
        csvHeaders.forEach(header => {
          if (!Object.values(fieldMapping).includes(header) && 
              row[header] !== undefined && 
              row[header] !== null && 
              row[header] !== '' && 
              (typeof row[header] !== 'string' || row[header].trim() !== '')) {
            customFields[header] = row[header];
          }
        });

        if (Object.keys(customFields).length > 0) {
          lead.customFields = customFields;
        }

        processed.push(lead);
      });

      // Show processing summary
      const summary = [];
      if (emptyRows > 0) summary.push(`${emptyRows} empty rows skipped`);
      if (malformedRows > 0) summary.push(`${malformedRows} malformed rows skipped`);
      if (errors.length > 0) summary.push(`${errors.length} validation errors`);
      if (processed.length > 0) summary.push(`${processed.length} valid leads ready to import`);

      if (errors.length > 0) {
        setErrorMessage(`Processing completed with issues:\n${summary.join(', ')}\n\nFirst few errors:\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? `\n... and ${errors.length - 5} more errors` : ''}`);
      } else {
      }

      setProcessedLeads(processed);
      setIsProcessing(false);
      setCurrentStep('preview');
    } catch (error) {
      setIsProcessing(false);
      setErrorMessage(`Error processing leads: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Save leads
  const handleSaveLeads = async () => {
    setIsSaving(true);
    setErrorMessage('');
    
    try {
      const response = await fetch('/api/leads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          leads: processedLeads,
          source: 'csv_import',
          listId: selectedListId || undefined
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save leads');
      }

      const result = await response.json();
      const listName = lists.find(l => l._id === result.listId)?.name;
      setImportSummary({ savedCount: result.savedCount || processedLeads.length, invalidCount: Math.max(0, (csvData.length || 0) - processedLeads.length), listName });
      // Handle partial success (some leads saved, some failed due to duplicates)
      if (result.savedCount < processedLeads.length) {
        // const duplicateCount = processedLeads.length - result.savedCount;
      } else {
      }
      
      setCurrentStep('complete');
    } catch (error) {
      console.error('Error saving leads:', error);
      setErrorMessage(`Error saving leads: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Integration handlers
  const handleIntegrationConnect = async () => {
    if (!selectedOption) return;

    setIsConnecting(true);
    setConnectionStatus('idle');

    try {
      let endpoint = '';

      switch (selectedOption) {
        case 'hubspot':
          endpoint = '/api/integrations/hubspot?action=oauth';
          break;
        case 'salesforce':
          endpoint = '/api/integrations/salesforce?action=oauth';
          break;
        case 'google-sheets':
          endpoint = '/api/integrations/google-sheets';
          break;
        default:
          throw new Error('Invalid integration type');
      }

      if (selectedOption === 'google-sheets') {
        const payload = { 
          accessToken: integrationCredentials.accessToken,
          spreadsheetId: integrationCredentials.accountId,
          sheetName: integrationCredentials.workspaceId || 'Sheet1'
        };

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (response.ok) {
          const data = await response.json();
          setConnectionStatus('success');
          alert(`Successfully imported ${data.importedCount} leads from ${importOptions.find(opt => opt.id === selectedOption)?.title}!`);
          resetImport();
        } else {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Connection failed');
        }
      } else {
        const response = await fetch(endpoint);
        
        if (response.ok) {
          const data = await response.json();
          window.location.href = data.authUrl;
        } else {
          const errorData = await response.json();
          throw new Error(errorData.error || 'OAuth initiation failed');
        }
      }
    } catch (error) {
      console.error('Integration error:', error);
      setConnectionStatus('error');
      setErrorMessage(`Error connecting to ${importOptions.find(opt => opt.id === selectedOption)?.title}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsConnecting(false);
    }
  };

  // Step indicator component
  const StepIndicator = () => {
    const steps = [
      { key: 'select', label: 'Choose Method', icon: FileText },
      { key: 'upload', label: selectedOption === 'csv' ? 'Upload File' : 'Connect', icon: Upload },
      { key: 'mapping', label: 'Map Fields', icon: MapPin },
      { key: 'preview', label: 'Preview', icon: Eye },
      { key: 'confirm', label: 'Complete', icon: CheckCircle },
    ];

    const currentStepIndex = steps.findIndex(step => step.key === currentStep);

    return (
      <div className="flex items-center justify-center mb-8">
        <div className="flex items-center space-x-4">
          {steps.map((step, index) => {
            const Icon = step.icon;
            const isActive = index === currentStepIndex;
            const isCompleted = index < currentStepIndex;
            
            return (
              <div key={step.key} className="flex items-center">
                <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all duration-200 ${
                  isActive 
                    ? 'border-primary bg-primary text-white' 
                    : isCompleted 
                      ? 'border-green-500 bg-green-500 text-white' 
                      : 'border-gray-300 bg-white text-gray-400'
                }`}>
                  <Icon className="w-5 h-5" />
                </div>
                <span className={`ml-2 text-sm font-medium ${
                  isActive ? 'text-primary' : isCompleted ? 'text-green-600' : 'text-gray-400'
                }`}>
                  {step.label}
                </span>
                {index < steps.length - 1 && (
                  <ChevronRight className="w-4 h-4 text-gray-300 mx-4" />
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto pb-24">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Import Leads</h1>
            <p className="text-gray-600 mt-2">Bring your leads into the system with our guided import process</p>
          </div>
          <button 
            onClick={async () => {
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
            }}
            className="flex items-center px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
              <Download className="w-4 h-4 mr-2" />
            <span className="text-sm font-medium">Download Template</span>
            </button>
        </div>

        {/* Step Indicator */}
        <StepIndicator />

        {/* Step Content */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          {/* Step 1: Select Import Method */}
          {currentStep === 'select' && (
            <div className="p-8">
              <div className="text-center mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-2">Choose Import Method</h2>
                <p className="text-gray-600">Select how you&apos;d like to import your leads</p>
              </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {importOptions.map((option) => {
            const Icon = option.icon;
            
            return (
              <div
                key={option.id}
                      className="relative bg-white rounded-lg border-2 border-gray-200 hover:border-primary transition-all duration-200 cursor-pointer group"
                onClick={() => handleOptionSelect(option.id)}
              >
                {option.premium && (
                  <div className="absolute top-4 right-4">
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-primary text-white">
                      Premium
                    </span>
                  </div>
                )}
                
                <div className="p-6">
                  <div className="flex items-start space-x-4">
                          <div className={`w-12 h-12 ${option.bgColor} rounded-lg flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform duration-200`}>
                      <Icon className={`w-6 h-6 ${option.color}`} />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-semibold text-gray-900 mb-1">{option.title}</h3>
                            <p className="text-sm text-gray-600 mb-4">{option.description}</p>
                      
                      <ul className="space-y-2 mb-6">
                        {option.features.map((feature, index) => (
                                <li key={index} className="flex items-center text-sm text-gray-600">
                            <CheckCircle className="w-4 h-4 text-green-500 mr-2 flex-shrink-0" />
                            {feature}
                          </li>
                        ))}
                      </ul>
                      
                            <div className="flex items-center text-primary font-medium">
                              <span className="text-sm">{option.action}</span>
                        <ArrowRight className="w-4 h-4 ml-2" />
                            </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
            </div>
          )}

          {/* Step 2: Upload File or Connect Integration */}
          {currentStep === 'upload' && (
            <div className="p-8">
              <div className="flex items-center mb-6">
                <button
                  onClick={() => setCurrentStep('select')}
                  className="flex items-center text-gray-600 hover:text-gray-900 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </button>
        </div>

              {selectedOption === 'csv' ? (
                <div className="text-center">
                  <h2 className="text-2xl font-semibold text-gray-900 mb-2">Upload CSV File</h2>
                  <p className="text-gray-600 mb-8">Choose your CSV file to get started</p>
                  
                  <div className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center hover:border-primary transition-colors">
                    <Upload className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">Drop your CSV file here</h3>
                    <p className="text-gray-600 mb-6">
                      Or click to browse your computer
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
                      className="px-8 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors font-medium"
              >
                  {isUploading ? 'Uploading...' : 'Choose File'}
              </button>

              {uploadStatus === 'success' && (
                <>
                  <div className="mt-6 flex items-center justify-center text-green-600">
                    <CheckCircle className="w-5 h-5 mr-2" />
                    <span className="text-sm font-medium">
                      File uploaded successfully! {csvData.length} records found.
                    </span>
                  </div>
                  {/* List selection required */}
                  <div className="mt-6 mx-auto max-w-md text-left">
                    <label className="block text-sm font-medium text-gray-700 mb-3">Where should these leads go?</label>
                    <div className="space-y-3">
                      <label className="flex items-center space-x-3">
                        <input type="radio" name="listMode" className="h-4 w-4" checked={listMode==='existing'} onChange={() => setListMode('existing')} />
                        <span className="text-sm text-gray-800">Add to existing list</span>
                      </label>
                      {listMode==='existing' && (
                        <select
                          value={selectedListId}
                          onChange={(e) => setSelectedListId(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                        >
                          <option value="">Select a list…</option>
                          {lists.map((l) => (
                            <option key={l._id} value={l._id}>{l.name}</option>
                          ))}
                        </select>
                      )}

                      <label className="flex items-center space-x-3 mt-2">
                        <input type="radio" name="listMode" className="h-4 w-4" checked={listMode==='new'} onChange={() => setListMode('new')} />
                        <span className="text-sm text-gray-800">Create a new list</span>
                      </label>
                      {listMode==='new' && (
                        <input
                          type="text"
                          value={newListName}
                          onChange={(e) => setNewListName(e.target.value)}
                          placeholder="Enter new list name"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                        />
                      )}
                    </div>

                    <div className="mt-6">
                      <button
                        onClick={async () => {
                          // Require selection
                          if (listMode==='existing') {
                            if (!selectedListId) return;
                            setCurrentStep('mapping');
                            return;
                          }
                          if (!newListName.trim()) return;
                          const res = await fetch('/api/lists', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newListName }) });
                          if (res.ok) {
                            const data = await res.json();
                            setLists((prev) => [{ _id: data.list._id, name: data.list.name }, ...prev]);
                            setSelectedListId(data.list._id);
                            setNewListName('');
                            setCurrentStep('mapping');
                          }
                        }}
                        disabled={(listMode==='existing' && !selectedListId) || (listMode==='new' && !newListName.trim())}
                        className="px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
                      >
                        Continue to Mapping
                      </button>
                    </div>
                  </div>
                </>
              )}

              {uploadStatus === 'error' && (
                      <div className="mt-6 flex items-center justify-center text-red-600">
                  <AlertCircle className="w-5 h-5 mr-2" />
                        <span className="text-sm font-medium">{errorMessage}</span>
                </div>
              )}
            </div>
          </div>
              ) : (
                <div>
                  <h2 className="text-2xl font-semibold text-gray-900 mb-2">
              Connect {importOptions.find(opt => opt.id === selectedOption)?.title}
            </h2>
                  <p className="text-gray-600 mb-8">
                    Follow the steps below to connect your {importOptions.find(opt => opt.id === selectedOption)?.title} account
                  </p>

                  {(selectedOption === 'hubspot' || selectedOption === 'salesforce') && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
                      <div className="flex items-start">
                        <div className="flex-shrink-0">
                          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                            <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                        </div>
                        <div className="ml-3">
                          <h3 className="text-sm font-medium text-blue-800">
                            OAuth Authentication
                          </h3>
                          <div className="mt-2 text-sm text-blue-700">
                            <p>
                              {selectedOption === 'hubspot' 
                                ? 'We\'ll redirect you to HubSpot to authorize access to your contacts. This is the most secure way to connect your account.'
                                : 'We\'ll redirect you to Salesforce to authorize access to your leads. This is the most secure way to connect your account.'
                              }
                            </p>
                          </div>
                        </div>
                      </div>
              </div>
                  )}

                  {selectedOption === 'google-sheets' && (
              <div className="space-y-4">
                <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Access Token
                  </label>
                  <input
                    type="password"
                          value={integrationCredentials.accessToken}
                          onChange={(e) => setIntegrationCredentials(prev => ({ ...prev, accessToken: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                          placeholder="Enter your Google API access token"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Spreadsheet ID
                        </label>
                        <input
                          type="text"
                          value={integrationCredentials.accountId}
                          onChange={(e) => setIntegrationCredentials(prev => ({ ...prev, accountId: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                          placeholder="Enter your Google Sheets spreadsheet ID"
                  />
                </div>
                
                <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Sheet Name (optional)
                  </label>
                  <input
                    type="text"
                          value={integrationCredentials.workspaceId}
                          onChange={(e) => setIntegrationCredentials(prev => ({ ...prev, workspaceId: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                          placeholder="Sheet1 (default)"
                        />
                      </div>
                    </div>
                  )}

                  {connectionStatus === 'error' && (
                    <div className="mt-4 flex items-center text-red-600">
                      <AlertCircle className="w-5 h-5 mr-2" />
                      <span className="text-sm">{errorMessage}</span>
                    </div>
                  )}

                  <div className="flex space-x-3 mt-8">
                    <button 
                      onClick={handleIntegrationConnect}
                      disabled={isConnecting}
                      className="px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors font-medium"
                    >
                      {isConnecting 
                        ? 'Connecting...' 
                        : (selectedOption === 'hubspot' || selectedOption === 'salesforce') 
                          ? 'Authorize & Import' 
                          : 'Connect & Import'
                      }
                    </button>
                    <button 
                      onClick={() => setCurrentStep('select')}
                      className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Field Mapping */}
          {currentStep === 'mapping' && (
            <div className="p-8">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-semibold text-gray-900 mb-2">Map CSV Columns</h2>
                  <p className="text-gray-600">Match your CSV columns to our lead fields</p>
                </div>
                <button
                  onClick={autoMapFields}
                  className="px-4 py-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
                >
                  Auto-map Fields
                </button>
              </div>


              <div className="space-y-6">
                {requiredFields.map((field) => {
                  const selectedColumn = fieldMapping[field.key];
                  const sampleValue = selectedColumn ? csvData[0]?.[selectedColumn] : null;
                  
                  return (
                    <div key={field.key} className="space-y-2">
                      <div className="flex items-center space-x-4">
                        <div className="w-32">
                          <label className="block text-sm font-medium text-gray-900">
                            {field.label}
                            {field.required && <span className="text-red-500 ml-1">*</span>}
                          </label>
                        </div>
                        <div className="flex-1">
                          <select
                            value={fieldMapping[field.key] || ''}
                            onChange={(e) => setFieldMapping(prev => ({ ...prev, [field.key]: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                          >
                            <option value="">Select column...</option>
                            {csvHeaders.map((header) => (
                              <option key={header} value={header}>
                                {header}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      
                      {/* Show sample data for selected column */}
                      {selectedColumn && sampleValue && (
                        <div className="ml-36">
                          <span className="text-xs text-gray-500">Sample: </span>
                          <span className="text-xs text-gray-700">
                            {field.key === 'phone' ? formatPhoneNumber(sampleValue) : 
                             field.key === 'email' ? formatEmail(sampleValue) : 
                             sampleValue}
                          </span>
                        </div>
                      )}
                      
                      {/* Show formatting info */}
                      {field.key === 'phone' && selectedColumn && (
                        <div className="ml-36">
                          <span className="text-xs text-gray-500">Note: Phone numbers will be automatically formatted with country codes</span>
                        </div>
                      )}
                      {field.key === 'email' && selectedColumn && (
                        <div className="ml-36">
                          <span className="text-xs text-gray-500">Note: Emails will be automatically cleaned and converted to lowercase</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-between mt-8">
                <button
                  onClick={() => setCurrentStep('upload')}
                  className="flex items-center px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                >
                  <ChevronLeft className="w-4 h-4 mr-2" />
                  Back
                </button>
                <button 
                  onClick={processLeads}
                  disabled={!fieldMapping.firstName || !fieldMapping.lastName || !fieldMapping.email || !fieldMapping.phone || isProcessing}
                  className="flex items-center px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors font-medium"
                >
                  {isProcessing ? 'Processing...' : 'Continue'}
                  <ChevronRight className="w-4 h-4 ml-2" />
                </button>
            </div>
          </div>
        )}

          {/* Step 4: Preview */}
          {currentStep === 'preview' && (
            <div className="p-8">
              <div className="mb-6">
                <h2 className="text-2xl font-semibold text-gray-900 mb-2">Preview Your Data</h2>
                <p className="text-gray-600">
                  Review {processedLeads.length} leads before importing
                </p>
              </div>

              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <div className="grid grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="font-medium text-gray-700">Total Records:</span>
                    <span className="ml-2 text-gray-900">{csvData.length}</span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Valid Leads:</span>
                    <span className="ml-2 text-green-600">{processedLeads.length}</span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Invalid Records:</span>
                    <span className="ml-2 text-red-600">{csvData.length - processedLeads.length}</span>
              </div>
              <div>
                    <span className="font-medium text-gray-700">File:</span>
                    <span className="ml-2 text-gray-900">{fileName}</span>
                  </div>
              </div>
            </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Email
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Phone
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Company
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {processedLeads.slice(0, 10).map((lead, index) => (
                      <tr key={index}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {lead.firstName} {lead.lastName}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {lead.email}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {lead.phone}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {lead.companyName || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {processedLeads.length > 10 && (
                <p className="text-gray-500 text-sm mt-4 text-center">
                  Showing first 10 of {processedLeads.length} records
                </p>
              )}

              <div className="flex justify-between mt-8">
                <button
                  onClick={() => setCurrentStep('mapping')}
                  className="flex items-center px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                >
                  <ChevronLeft className="w-4 h-4 mr-2" />
                  Back
                </button>
                <button
                  onClick={handleSaveLeads}
                  disabled={processedLeads.length === 0 || isSaving}
                  className="flex items-center px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors font-medium"
                >
                  {isSaving ? 'Importing...' : `Import ${processedLeads.length} Leads`}
                  <Save className="w-4 h-4 ml-2" />
                </button>
              </div>
            </div>
          )}

          {/* Step 5: Complete */}
          {currentStep === 'complete' && (
            <div className="p-8 text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              
              <h2 className="text-2xl font-semibold text-gray-900 mb-2">Import Complete</h2>
              <div className="mx-auto max-w-md bg-gray-50 rounded-lg p-4 text-left">
                <div className="flex justify-between py-2"><span className="text-gray-600">File</span><span className="text-gray-900">{fileName}</span></div>
                <div className="flex justify-between py-2"><span className="text-gray-600">Saved</span><span className="text-green-700 font-medium">{importSummary?.savedCount ?? processedLeads.length}</span></div>
                <div className="flex justify-between py-2"><span className="text-gray-600">Invalid</span><span className="text-red-600">{importSummary?.invalidCount ?? 0}</span></div>
                <div className="flex justify-between py-2"><span className="text-gray-600">List</span><span className="text-gray-900">{importSummary?.listName || 'CSV Import'}</span></div>
              </div>

              <div className="flex justify-center space-x-4 mt-8">
                <button
                  onClick={() => window.location.href = '/leads'}
                  className="px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors font-medium"
                >
                  View Leads
                </button>
                <button
                  onClick={resetImport}
                  className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                >
                  Import More
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}