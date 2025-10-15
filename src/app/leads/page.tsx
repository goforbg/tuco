'use client';

import { useState, useRef, useEffect } from 'react';
import { Upload, Download, MapPin, Users, FileText, AlertCircle, Plus, Search, X, Save, Trash2, Trash, ChevronLeft, ChevronRight, Info, Zap, LoaderCircle } from 'lucide-react';
import { useOrganization } from '@clerk/nextjs';
import { toast } from 'sonner';
// import Papa from 'papaparse';
import DashboardLayout from '@/components/DashboardLayout';

interface LeadData {
  _id?: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  // Alternate Contact Information
  altPhone1?: string;
  altPhone2?: string;
  altPhone3?: string;
  altEmail1?: string;
  altEmail2?: string;
  altEmail3?: string;
  companyName?: string;
  jobTitle?: string;
  linkedinUrl?: string;
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
  // iMessage availability status
  availabilityStatus?: 'checking' | 'available' | 'unavailable' | 'error' | 'no_active_line';
  availabilityCheckedAt?: string;
}

interface ListData {
  _id: string;
  name: string;
  description?: string;
  leadCount: number;
  createdAt: string;
}

interface LineData {
  _id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  isActive: boolean;
  provisioningStatus: 'provisioning' | 'active' | 'failed';
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
  // const [isUploading, setIsUploading] = useState(false);
  // const [uploadStatus, setUploadStatus] = useState<'idle' | 'success' | 'error'>('idle');
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
  const [showBulkDeleteList, setShowBulkDeleteList] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { organization } = useOrganization();

  // Message sending state
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [selectedLeadForMessage, setSelectedLeadForMessage] = useState<LeadData | null>(null);
  const [lines, setLines] = useState<LineData[]>([]);
  const [selectedLineId, setSelectedLineId] = useState<string>('');
  const [messageText, setMessageText] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  
  // Scheduling state
  const [sendImmediately, setSendImmediately] = useState(true);
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');

  // Load existing leads and lists on component mount
  useEffect(() => {
    loadLeadsAndLists();
    loadLines();
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

  const loadLines = async () => {
    try {
      const response = await fetch('/api/lines');
      if (response.ok) {
        const data = await response.json();
        setLines(data.lines || []);
        // Set default selected line if none selected and lines are available
        if (!selectedLineId && data.lines && data.lines.length > 0) {
          const activeLine = data.lines.find((line: LineData) => line.isActive && line.provisioningStatus === 'active');
          if (activeLine) {
            setSelectedLineId(activeLine._id);
          }
        }
      }
    } catch (error) {
      console.error('Error loading lines:', error);
    }
  };

  // const checkAvailabilityStatus = async (leadIds?: string[]) => {
  //   try {
  //     const response = await fetch('/api/leads/check-availability', {
  //       method: 'POST',
  //       headers: { 'Content-Type': 'application/json' },
  //       body: JSON.stringify({ 
  //         leadIds: leadIds || filteredLeads.map(lead => lead._id).filter(Boolean),
  //       }),
  //     });
  //     
  //     if (response.ok) {
  //       const data = await response.json();
  //       toast.success(`Availability checked for ${data.checked} leads`);
  //       // Reload leads to get updated status
  //       await loadLeadsAndLists();
  //     } else {
  //       const errorData = await response.json();
  //       
  //       // Handle specific error cases with clear messages
  //       if (errorData.error === 'NO_ACTIVE_LINE') {
  //         toast.error('No Active Line Found', {
  //           description: 'You need to create and activate a line in the Lines page before checking availability.',
  //           action: {
  //             label: 'Go to Lines',
  //             onClick: () => window.open('/lines', '_blank')
  //           }
  //         });
  //       } else {
  //         toast.error('Availability Check Failed', {
  //           description: errorData.message || errorData.error || 'Failed to check availability. Please try again.'
  //         });
  //       }
  //     }
  //   } catch (error) {
  //     console.error('Error checking availability status:', error);
  //     toast.error('Error checking availability status');
  //   }
  // };

  // Function to get or create "quick-sends" list
  const getOrCreateQuickSendsList = async () => {
    try {
      // First try to find existing "quick-sends" list (case insensitive)
      const existingList = lists.find(list => 
        list.name.toLowerCase() === 'quick-sends' || 
        list.name.toLowerCase() === 'quick sends'
      );
      if (existingList) {
        return existingList._id;
      }

      // Create new "quick-sends" list if it doesn't exist
      const response = await fetch('/api/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Quick Sends', description: 'Quick send messages' }),
      });

      if (response.ok) {
        const data = await response.json();
        setLists(prev => [data.list, ...prev]);
        return data.list._id;
      } else {
        // If creation failed, try to find the list again (might have been created by another request)
        const errorData = await response.json();
        console.warn('Failed to create Quick Sends list:', errorData);
        
        // Reload lists to check if it was created by another process
        const listsResponse = await fetch('/api/lists');
        if (listsResponse.ok) {
          const listsData = await listsResponse.json();
          setLists(listsData.lists || []);
          
          const quickSendsList = listsData.lists.find((list: ListData) => 
            list.name.toLowerCase() === 'quick-sends' || 
            list.name.toLowerCase() === 'quick sends'
          );
          
          if (quickSendsList) {
            return quickSendsList._id;
          }
        }
        
        // If still not found, show error
        toast.error('Failed to create Quick Sends list', {
          description: errorData.error || 'Please try again or create a list manually.'
        });
        return null;
      }
    } catch (error) {
      console.error('Error creating quick-sends list:', error);
      toast.error('Failed to create Quick Sends list', {
        description: 'Network error. Please try again.'
      });
      return null;
    }
  };

  // Validation functions
  const isValidEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const isValidPhone = (phone: string) => {
    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    return phoneRegex.test(phone.replace(/\s/g, ''));
  };

  // Function to check availability for Quick Send
  const checkQuickSendAvailability = async () => {
    if (selectedLeadForMessage?._id !== 'quick-send') return;
    
    // Get all contact methods in priority order
    const contactMethods = [
      selectedLeadForMessage.phone,
      selectedLeadForMessage.altPhone1,
      selectedLeadForMessage.altPhone2,
      selectedLeadForMessage.altPhone3,
      selectedLeadForMessage.email,
      selectedLeadForMessage.altEmail1,
      selectedLeadForMessage.altEmail2,
      selectedLeadForMessage.altEmail3,
    ].filter(Boolean); // Remove empty values
    
    // Validate that we have at least one valid contact method
    if (contactMethods.length === 0) {
      toast.error('Please enter either a phone number or email address');
      return;
    }

    // Validate the primary contact method (phone if available, otherwise email)
    const primaryPhone = selectedLeadForMessage.phone;
    const primaryEmail = selectedLeadForMessage.email;
    
    if (primaryPhone && !isValidPhone(primaryPhone)) {
      toast.error('Please enter a valid phone number (e.g., +1234567890)');
      return;
    }

    if (primaryEmail && !isValidEmail(primaryEmail)) {
      toast.error('Please enter a valid email address');
      return;
    }

    // Use the first available contact method (highest priority)
    const address = contactMethods[0];
    if (!address) return;

    try {
      setSelectedLeadForMessage(prev => prev ? { ...prev, availabilityStatus: 'checking' } : null);
      
      const response = await fetch('/api/leads/check-availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address }),
      });

      if (response.ok) {
        const data = await response.json();
        setSelectedLeadForMessage(prev => prev ? { 
          ...prev, 
          availabilityStatus: data.available ? 'available' : 'unavailable' 
        } : null);
        
        if (data.available) {
          toast.success('iMessage is available for this contact!');
        } else {
          toast.info('iMessage not available, will send as SMS/Email');
        }
      } else {
        const errorData = await response.json();
        setSelectedLeadForMessage(prev => prev ? { ...prev, availabilityStatus: 'error' } : null);
        
        // Handle specific error cases
        if (errorData.error === 'NO_ACTIVE_LINE') {
          toast.error('No Active Line Found', {
            description: 'You need to create and activate a line in the Lines page before checking availability.',
            action: {
              label: 'Go to Lines',
              onClick: () => window.open('/lines', '_blank')
            }
          });
        } else {
          toast.error('Failed to check availability', {
            description: errorData.message || errorData.error || 'Please try again.'
          });
        }
      }
    } catch (error) {
      console.error('Error checking availability:', error);
      setSelectedLeadForMessage(prev => prev ? { ...prev, availabilityStatus: 'error' } : null);
      toast.error('Error checking availability', {
        description: 'Network error or server unavailable. Please try again.'
      });
    }
  };

  const sendMessage = async () => {
    if (!selectedLeadForMessage || !selectedLineId || !messageText.trim()) {
      return;
    }

    try {
      setIsSendingMessage(true);
      
      // Handle Quick Send vs Regular Lead
      const isQuickSend = selectedLeadForMessage._id === 'quick-send';
      
      let messageType = 'imessage'; // Default
      let recipientEmail = '';
      let recipientPhone = '';
      let recipientName = '';
      
      if (isQuickSend) {
        // Quick Send logic - check availability first
        if (selectedLeadForMessage.availabilityStatus !== 'available' && selectedLeadForMessage.availabilityStatus !== 'unavailable') {
          toast.error('Please check availability before sending');
          return;
        }

        // Only allow sending if iMessage is available
        if (selectedLeadForMessage.availabilityStatus !== 'available') {
          toast.error('Cannot send message - iMessage is not available for this contact');
          return;
        }

        // Get or create quick-sends list
        const quickSendsListId = await getOrCreateQuickSendsList();
        if (!quickSendsListId) {
          toast.error('Failed to create quick-sends list');
          return;
        }

        // Determine message type and recipient - prioritize phone numbers over email
        // Priority: phone → altPhone1, altPhone2, altPhone3 → email → altEmail1, altEmail2, altEmail3
        if (selectedLeadForMessage.phone) {
          messageType = 'imessage';
          recipientPhone = selectedLeadForMessage.phone;
        } else if (selectedLeadForMessage.altPhone1) {
          messageType = 'imessage';
          recipientPhone = selectedLeadForMessage.altPhone1;
        } else if (selectedLeadForMessage.altPhone2) {
          messageType = 'imessage';
          recipientPhone = selectedLeadForMessage.altPhone2;
        } else if (selectedLeadForMessage.altPhone3) {
          messageType = 'imessage';
          recipientPhone = selectedLeadForMessage.altPhone3;
        } else if (selectedLeadForMessage.email) {
          messageType = 'email';
          recipientEmail = selectedLeadForMessage.email;
        } else if (selectedLeadForMessage.altEmail1) {
          messageType = 'email';
          recipientEmail = selectedLeadForMessage.altEmail1;
        } else if (selectedLeadForMessage.altEmail2) {
          messageType = 'email';
          recipientEmail = selectedLeadForMessage.altEmail2;
        } else if (selectedLeadForMessage.altEmail3) {
          messageType = 'email';
          recipientEmail = selectedLeadForMessage.altEmail3;
        }
        
        recipientName = `${selectedLeadForMessage.firstName} ${selectedLeadForMessage.lastName}`.trim() || 
                      selectedLeadForMessage.email || selectedLeadForMessage.phone;
      } else {
        // Regular lead logic - ONLY send if iMessage is available
        if (selectedLeadForMessage.availabilityStatus !== 'available') {
          toast.error('Cannot send message - this lead does not have iMessage available');
          return;
        }

        messageType = 'imessage'; // Always iMessage for regular leads since we check availability
        recipientEmail = selectedLeadForMessage.email;
        recipientPhone = selectedLeadForMessage.phone;
        recipientName = `${selectedLeadForMessage.firstName} ${selectedLeadForMessage.lastName}`;
      }
      
      // Prepare request body
      const requestBody: Record<string, unknown> = {
        message: messageText,
        messageType,
        fromLineId: selectedLineId,
        recipientEmail: recipientEmail || undefined,
        recipientPhone: recipientPhone || undefined,
        recipientName,
      };

      // Add leadId only for regular leads
      if (!isQuickSend) {
        requestBody.leadId = selectedLeadForMessage._id;
      }

      // Add scheduling if not sending immediately
      if (!sendImmediately && scheduledDate && scheduledTime) {
        const scheduledDateTime = new Date(`${scheduledDate}T${scheduledTime}`);
        if (scheduledDateTime > new Date()) {
          requestBody.scheduledDate = scheduledDateTime.toISOString();
        }
      }
      
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (response.ok) {
        // const data = await response.json();
        const successMessage = sendImmediately || !requestBody.scheduledDate 
          ? 'Message sent successfully!' 
          : `Message scheduled for ${new Date(requestBody.scheduledDate as string).toLocaleString()}!`;
        toast.success(successMessage);
        setShowMessageModal(false);
        setSelectedLeadForMessage(null);
        setMessageText('');
        setSendImmediately(true);
        setScheduledDate('');
        setScheduledTime('');
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to send message');
      }
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage = error instanceof Error ? error.message : 'Please try again.';
      
      // Show specific toast based on error type
      if (errorMessage.includes('Line is not active')) {
        toast.error('Line Not Active', {
          description: 'The selected line is not active or ready for sending messages. Please select an active line.',
        });
      } else if (errorMessage.includes('Line not found')) {
        toast.error('Line Not Found', {
          description: 'The selected line could not be found. Please select a different line.',
        });
      } else if (errorMessage.includes('HTTP')) {
        toast.error('Server Error', {
          description: `Failed to send message: ${errorMessage}`,
        });
      } else {
        toast.error('Message Failed', {
          description: errorMessage,
        });
      }
    } finally {
      setIsSendingMessage(false);
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
        setSelectedList(data.list._id); // Auto-select the newly created list
        setNewListName('');
        setNewListDescription('');
        setShowCreateList(false);
      }
    } catch (error) {
      console.error('Error creating list:', error);
    }
  };

  // const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
  //   const file = event.target.files?.[0];
  //   if (!file) return;

  //   setIsUploading(true);
  //   setUploadStatus('idle');

  //   Papa.parse(file, {
  //     header: true,
  //     complete: (results) => {
  //       setCsvData(results.data as Record<string, string>[]);
  //       setIsUploading(false);
  //       setUploadStatus('success');
  //     },
  //     error: (error) => {
  //       console.error('Error parsing CSV:', error);
  //       setIsUploading(false);
  //       setUploadStatus('error');
  //     },
  //   });
  // };

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
    if (!selectedList) {
      toast.error('List Required', {
        description: 'Please select an existing list or create a new list before saving leads.',
      });
      return;
    }

    try {
      const response = await fetch('/api/leads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          leads: mappedData,
          listId: selectedList,
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
      setSelectedIds(filteredLeads.map(l => l._id!).filter(Boolean));
      // Show bulk delete option when all filtered leads are selected
      if (selectedList && filteredLeads.length > 0) {
        setShowBulkDeleteList(true);
      }
    } else {
      setSelectedIds([]);
      setShowBulkDeleteList(false);
    }
  };

  const toggleSelectOne = (id?: string) => {
    if (!id) return;
    setSelectedIds(prev => {
      const newSelectedIds = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      
      // Hide bulk delete option if not all filtered leads are selected
      if (newSelectedIds.length !== filteredLeads.length || !selectedList) {
        setShowBulkDeleteList(false);
      } else if (newSelectedIds.length === filteredLeads.length && selectedList) {
        setShowBulkDeleteList(true);
      }
      
      return newSelectedIds;
    });
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

  const handleDeleteEntireList = async () => {
    if (!selectedList) return;
    const list = lists.find(l => l._id === selectedList);
    const listName = list?.name || 'this list';
    const leadCount = list?.leadCount || 0;
    if (!confirm(`Delete entire list "${listName}" and all ${leadCount} leads in it? This action cannot be undone.`)) return;
    
    try {
      const res = await fetch('/api/lists', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listId: selectedList, deleteLeads: true })
      });
      
      if (res.ok) {
        toast.success(`List "${listName}" and all leads deleted successfully`);
        setSelectedList('');
        setSelectedIds([]);
        setShowBulkDeleteList(false);
        await loadLeadsAndLists();
      } else {
        const errorData = await res.json();
        toast.error('Failed to delete list', {
          description: errorData.error || 'Please try again.'
        });
      }
    } catch (e) {
      console.error('Delete list failed', e);
      toast.error('Failed to delete list', {
        description: 'Network error. Please try again.'
      });
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

  const recheckSingleAvailability = async (leadId?: string) => {
    if (!leadId) return;
    try {
      toast.info("Checking availability....")
      const response = await fetch(`/api/leads/check-availability?id=${leadId}`);
      if (response.ok) {
        await response.json(); // Response is not used, just need to consume it
        toast.success('Availability checked successfully');
        // Reload leads to get updated status
        await loadLeadsAndLists();
        // Update sidebar lead if it's the same one
        if (sidebarLead && sidebarLead._id === leadId) {
          const updatedLead = leads.find(l => l._id === leadId);
          if (updatedLead) {
            setSidebarLead(updatedLead);
          }
        }
      } else {
        const errorData = await response.json();
        toast.error('Failed to check availability', {
          description: errorData.error || 'Please try again.'
        });
      }
    } catch (error) {
      console.error('Error checking availability:', error);
      toast.error('Error checking availability');
    }
  };

  const recheckBulkAvailability = async () => {
    toast.info('Checking availability for selected leads...');

    if (selectedIds.length === 0) {
      toast.error('Please select leads to check availability');
      return;
    }
    
    try {
      const response = await fetch('/api/leads/check-availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadIds: selectedIds }),
      });
      
      if (response.ok) {
        const data = await response.json();
        toast.success(`Availability checked for ${data.checked} leads`);
        // Reload leads to get updated status
        await loadLeadsAndLists();
        // Clear selection
        setSelectedIds([]);
      } else {
        const errorData = await response.json();
        
        // Handle specific error cases with clear messages
        if (errorData.error === 'NO_ACTIVE_LINE') {
          toast.error('No Active Line Found', {
            description: 'You need to create and activate a line in the Lines page before checking availability.',
            action: {
              label: 'Go to Lines',
              onClick: () => window.open('/lines', '_blank')
            }
          });
        } else {
          toast.error('Availability Check Failed', {
            description: errorData.message || errorData.error || 'Failed to check availability. Please try again.'
          });
        }
      }
    } catch (error) {
      console.error('Error checking availability status:', error);
      toast.error('Error checking availability status');
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

  const getAvailabilityDot = (lead: LeadData) => {
    switch (lead.availabilityStatus) {
      case 'checking':
        return <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" title="Checking availability..." />;
      case 'available':
        return <div className="w-2 h-2 bg-blue-500 rounded-full" title="iMessage available" />;
      case 'unavailable':
        return <div className="w-2 h-2 bg-gray-400 rounded-full" title="iMessage not available" />;
      case 'error':
        return <div className="w-2 h-2 bg-red-500 rounded-full" title="Error checking availability" />;
      case 'no_active_line':
        return <div className="w-2 h-2 bg-red-600 rounded-full" title="Unable to check without an active line" />;
      default:
        return <div className="w-2 h-2 bg-gray-300 rounded-full" title="Availability not checked" />;
    }
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
              <>
                <button
                  onClick={recheckBulkAvailability}
                  className="flex items-center px-3 py-2 border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50 transition-colors cursor-pointer"
                  title="Recheck Availability for Selected Leads"
                >
                  <Zap className="w-4 h-4 mr-1" />
                  <span className="text-body-small font-body-small">Recheck</span>
                </button>
                {showBulkDeleteList && selectedList && (
                  <button
                    onClick={handleDeleteEntireList}
                    className="shrink-0 flex items-center px-3 py-2 border border-red-300 text-red-700 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                    title="Delete entire list and all leads"
                  >
                    <Trash className="w-4 h-4 mr-1" />
                    <span className="text-body-small font-body-small">Delete Entire List</span>
                  </button>
                )}
                <button
                  onClick={handleDeleteSelected}
                  className="shrink-0 flex items-center px-3 py-2 border border-red-300 text-red-700 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                  title="Delete selected leads"
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  <span className="text-body-small font-body-small">Delete Selected</span>
                </button>
              </>
            )}
            <button
              onClick={() => {
                // Set up Quick Send state
                setSelectedLeadForMessage({
                  _id: 'quick-send',
                  firstName: '',
                  lastName: '',
                  email: '',
                  phone: '',
                  altPhone1: '',
                  altPhone2: '',
                  altPhone3: '',
                  altEmail1: '',
                  altEmail2: '',
                  altEmail3: '',
                  source: 'manual',
                  createdAt: new Date().toISOString(),
                  availabilityStatus: undefined // Don't set to 'checking' initially
                });
                setMessageText('');
                setSendImmediately(true);
                setShowMessageModal(true);
              }}
              className="flex shrink-0 items-center px-3 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors cursor-pointer"
            >
              <Zap className="w-4 h-4 mr-1" />
              <span className="text-body-small font-body-small">Quick Send</span>
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
                  <th className="px-6 py-3"><input type="checkbox" aria-label="Select all" checked={selectedIds.length === filteredLeads.length && filteredLeads.length > 0} onChange={(e) => toggleSelectAll(e.target.checked)} /></th>
                  <th className="px-6 py-3 text-left text-body-small font-body-small text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-body-small font-body-small text-gray-500 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-body-small font-body-small text-gray-500 uppercase tracking-wider">
                    Phone
                  </th>
                  <th className="px-2 py-3 text-left text-body-small font-body-small text-gray-500 uppercase tracking-wider w-20">
                    iMessage
                  </th>
                  <th className="px-6 py-3 text-left text-body-small font-body-small text-gray-500 uppercase tracking-wider">
                    Company
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
                    <td className="px-2 py-4 whitespace-nowrap text-body-small text-gray-500">
                      {getAvailabilityDot(lead)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-body-small text-gray-500 cursor-pointer" onClick={() => setSidebarLead(lead)}>
                      {lead.companyName || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-body-small text-gray-500 cursor-pointer" onClick={() => setSidebarLead(lead)}>
                      {formatDate(lead.createdAt)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-body-small text-gray-500 space-x-2">
                      <button 
                        onClick={() => {
                          setSelectedLeadForMessage(lead);
                          setShowMessageModal(true);
                        }}
                        disabled={lead.availabilityStatus !== 'available'}
                        className="px-3 py-1 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Send
                      </button>
                      <span className="relative inline-block">
                        <button onClick={() => setOpenMenuId(openMenuId === lead._id ? null : (lead._id || null))} className="px-2 py-1 border border-gray-300 rounded-lg hover:bg-gray-50">•••</button>
                        {openMenuId === lead._id && (
                          <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-50 overflow-hidden">
                            <div className="py-1">
                              <button 
                                onClick={() => { setSidebarLead(lead); setOpenMenuId(null); }} 
                                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 block"
                              >
                                Edit
                              </button>
                              <button 
                                onClick={() => {
                                  setSelectedLeadForMessage(lead);
                                  setShowMessageModal(true);
                                  setOpenMenuId(null);
                                }} 
                                disabled={lead.availabilityStatus !== 'available'}
                                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed block"
                              >
                                Send Message
                              </button>
                              <button 
                                onClick={() => { recheckSingleAvailability(lead._id); setOpenMenuId(null); }} 
                                className="w-full text-left px-4 py-2 text-sm text-blue-600 hover:bg-gray-100 block"
                              >
                                Recheck Availability
                              </button>
                              <button 
                                onClick={() => { deleteSingleLead(lead._id); setOpenMenuId(null); }} 
                                className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100 block"
                              >
                                Delete
                              </button>
                            </div>
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

          {/* List Selection */}
          <div className="mt-6 border-t border-gray-200 pt-6">
            <h3 className="text-md font-medium text-gray-900 mb-4">Select List</h3>
            <p className="text-sm text-gray-600 mb-4">
              Choose which list to add these leads to, or create a new list.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  Existing List
                </label>
                <select
                  value={selectedList}
                  onChange={(e) => setSelectedList(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                >
                  <option value="">Select a list...</option>
                  {lists.map((list) => (
                    <option key={list._id} value={list._id}>
                      {list.name} ({list.leadCount || 0} leads)
                    </option>
                  ))}
                </select>
              </div>
              
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  Or Create New List
                </label>
                {showCreateList ? (
                  <div className="space-y-3">
                    <input
                      type="text"
                      placeholder="Enter list name..."
                      value={newListName}
                      onChange={(e) => setNewListName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    />
                    <input
                      type="text"
                      placeholder="Description (optional)"
                      value={newListDescription}
                      onChange={(e) => setNewListDescription(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    />
                    <div className="flex space-x-2">
                      <button
                        onClick={handleCreateList}
                        disabled={!newListName.trim()}
                        className="flex-1 px-3 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors cursor-pointer disabled:cursor-not-allowed"
                      >
                        Create
                      </button>
                      <button
                        onClick={() => {
                          setShowCreateList(false);
                          setNewListName('');
                          setNewListDescription('');
                        }}
                        className="px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowCreateList(true)}
                    className="w-full px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
                  >
                    <Plus className="w-4 h-4 mr-2 inline" />
                    Create New List
                  </button>
                )}
              </div>
            </div>
            
            {!selectedList && (
              <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="flex items-center">
                  <AlertCircle className="w-4 h-4 text-yellow-600 mr-2" />
                  <span className="text-sm text-yellow-800">
                    Please select an existing list or create a new one before saving leads.
                  </span>
                </div>
              </div>
            )}
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
              disabled={!selectedList}
              className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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
                <button onClick={() => recheckSingleAvailability(sidebarLead._id)} className="px-3 py-2 border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50" title="Recheck Availability"><Zap className="w-4 h-4" /></button>
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

      {/* Message Sending Modal */}
      {showMessageModal && selectedLeadForMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/20" onClick={() => setShowMessageModal(false)} />
          <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">
                  {selectedLeadForMessage._id === 'quick-send' ? 'Quick Send Message' : 'Send Message'}
                </h3>
                <button
                  onClick={() => setShowMessageModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="space-y-4">
                {selectedLeadForMessage._id === 'quick-send' ? (
                  // Quick Send Form
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          First Name
                        </label>
                        <input
                          type="text"
                          value={selectedLeadForMessage.firstName}
                          onChange={(e) => setSelectedLeadForMessage(prev => prev ? { ...prev, firstName: e.target.value } : null)}
                          placeholder="First name"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Last Name
                        </label>
                        <input
                          type="text"
                          value={selectedLeadForMessage.lastName}
                          onChange={(e) => setSelectedLeadForMessage(prev => prev ? { ...prev, lastName: e.target.value } : null)}
                          placeholder="Last name"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Email
                      </label>
                      <input
                        type="email"
                        value={selectedLeadForMessage.email}
                        onChange={(e) => setSelectedLeadForMessage(prev => prev ? { ...prev, email: e.target.value } : null)}
                        placeholder="Email address"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Phone Number
                      </label>
                      <div className="flex items-end gap-3">
                        <div className="flex-1">
                          <input
                            type="text"
                            value={selectedLeadForMessage.phone}
                            onChange={(e) => setSelectedLeadForMessage(prev => prev ? { ...prev, phone: e.target.value } : null)}
                            placeholder="Phone number (+1234567890)"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                          />
                        </div>
                        <button
                          onClick={checkQuickSendAvailability}
                          disabled={selectedLeadForMessage.availabilityStatus === 'checking'}
                          className="flex flex-col items-center justify-center px-3 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-w-[60px]"
                        >
                           {selectedLeadForMessage.availabilityStatus !== 'checking' ? <Zap className="w-4 h-4" /> : <LoaderCircle className="w-4 h-4 animate-spin" /> } 
                          
                        </button>
                      </div>
                    </div>
                    
                    {/* Status Display */}
                    <div className="text-sm">
                      {selectedLeadForMessage.availabilityStatus === 'checking' && (
                        <span className="text-yellow-600">• Checking availability...</span>
                      )}
                      {selectedLeadForMessage.availabilityStatus === 'available' && (
                        <span className="text-blue-600">• iMessage available</span>
                      )}
                      {selectedLeadForMessage.availabilityStatus === 'unavailable' && (
                        <span className="text-gray-500">• SMS only</span>
                      )}
                      {selectedLeadForMessage.availabilityStatus === 'error' && (
                        <span className="text-red-600">• Error checking availability</span>
                      )}
                      {(!selectedLeadForMessage.availabilityStatus || selectedLeadForMessage.availabilityStatus === undefined) && (
                        <span className="text-gray-500">• Click &quot;Check&quot; to verify iMessage support</span>
                      )}
                    </div>
                  </>
                ) : (
                  // Regular Lead Form
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      To: {selectedLeadForMessage.firstName} {selectedLeadForMessage.lastName}
                    </label>
                    <div className="text-sm text-gray-500">
                      {selectedLeadForMessage.email} • {selectedLeadForMessage.phone}
                      <span className="ml-2">
                        {selectedLeadForMessage.availabilityStatus === 'available' ? 
                          <span className="text-blue-600">• iMessage available</span> : 
                          selectedLeadForMessage.availabilityStatus === 'unavailable' ?
                          <span className="text-gray-500">• SMS only</span> :
                          selectedLeadForMessage.availabilityStatus === 'checking' ?
                          <span className="text-yellow-600">• Checking availability...</span> :
                          selectedLeadForMessage.availabilityStatus === 'no_active_line' ?
                          <span className="text-red-600">• Unable to check without active line</span> :
                          <span className="text-gray-500">• Availability not checked</span>
                        }
                      </span>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    From Line
                  </label>
                  <select
                    value={selectedLineId}
                    onChange={(e) => setSelectedLineId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  >
                    <option value="">Select a line...</option>
                    {lines.filter(line => line.isActive && line.provisioningStatus === 'active').map((line) => (
                      <option key={line._id} value={line._id}>
                        {line.firstName} {line.lastName} ({line.phone})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Message
                  </label>
                  <textarea
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    placeholder="Type your message here..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    rows={4}
                  />
                </div>

                {!sendImmediately && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Date</label>
                      <input
                        type="date"
                        value={scheduledDate}
                        onChange={(e) => setScheduledDate(e.target.value)}
                        min={new Date().toISOString().split('T')[0]}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Time</label>
                      <input
                        type="time"
                        value={scheduledTime}
                        onChange={(e) => setScheduledTime(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => setSendImmediately(false)}
                  className={`px-6 py-3 rounded-lg font-medium transition-colors ${
                    !sendImmediately
                      ? 'bg-primary text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Send Later
                </button>
                <button
                  onClick={sendMessage}
                  disabled={
                    isSendingMessage || 
                    !selectedLineId || 
                    !messageText.trim() ||
                    (!sendImmediately && (!scheduledDate || !scheduledTime)) ||
                    (selectedLeadForMessage._id === 'quick-send' && 
                     selectedLeadForMessage.availabilityStatus !== 'available' && 
                     selectedLeadForMessage.availabilityStatus !== 'unavailable') ||
                    (selectedLeadForMessage._id !== 'quick-send' && 
                     selectedLeadForMessage.availabilityStatus !== 'available')
                  }
                  className={`px-6 py-3 rounded-lg font-medium transition-colors ${
                    sendImmediately
                      ? 'bg-primary text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {isSendingMessage ? 'Sending...' : 'Send Now'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </DashboardLayout>
  );
}
