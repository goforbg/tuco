'use client';

import { useState, useEffect, useCallback } from 'react';
import { Activity, CheckCircle, XCircle, AlertTriangle, MessageSquare, Phone, Mail, Calendar, Filter, RefreshCw } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';

interface ActivityData {
  _id: string;
  type: 'message_sent' | 'message_failed' | 'line_error' | 'api_error';
  action: 'send_message' | 'schedule_message' | 'batch_send';
  description: string;
  messageContent?: string;
  messageType?: 'email' | 'sms' | 'imessage';
  recipientEmail?: string;
  recipientPhone?: string;
  recipientName?: string;
  fromLinePhone?: string;
  fromLineEmail?: string;
  externalMessageId?: string;
  apiEndpoint?: string;
  status: 'success' | 'error' | 'warning';
  errorCode?: string;
  errorMessage?: string;
  scheduledDate?: string;
  batchId?: string;
  createdAt: string;
}

export default function ActivitiesPage() {
  const [activities, setActivities] = useState<ActivityData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'success' | 'error' | 'warning'>('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const loadActivities = useCallback(async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams({ 
        page: String(page), 
        limit: '50',
        filter: filter !== 'all' ? filter : ''
      });
      
      const response = await fetch(`/api/activities?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setActivities(data.activities || []);
        if (data.pagination) {
          setTotalPages(data.pagination.totalPages || 1);
        }
      }
    } catch (error) {
      console.error('Error loading activities:', error);
    } finally {
      setIsLoading(false);
    }
  }, [page, filter]);

  useEffect(() => {
    loadActivities();
  }, [page, filter, loadActivities]);

  const getStatusIcon = (status: string) => {
    if (status === 'success') {
      return <CheckCircle className="w-4 h-4 text-green-500" />;
    } else if (status === 'error') {
      return <XCircle className="w-4 h-4 text-red-500" />;
    } else if (status === 'warning') {
      return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
    }
    return <Activity className="w-4 h-4 text-gray-500" />;
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'message_sent':
        return <MessageSquare className="w-4 h-4 text-blue-500" />;
      case 'message_failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'line_error':
        return <Phone className="w-4 h-4 text-orange-500" />;
      case 'api_error':
        return <AlertTriangle className="w-4 h-4 text-red-500" />;
      default:
        return <Activity className="w-4 h-4 text-gray-500" />;
    }
  };

  const getMessageTypeIcon = (messageType?: string) => {
    switch (messageType) {
      case 'email':
        return <Mail className="w-4 h-4 text-blue-500" />;
      case 'sms':
        return <Phone className="w-4 h-4 text-green-500" />;
      case 'imessage':
        return <MessageSquare className="w-4 h-4 text-blue-600" />;
      default:
        return null;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const filteredActivities = activities.filter(activity => {
    if (filter === 'all') return true;
    return activity.status === filter;
  });

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto space-y-6 pb-24">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Activity Log</h1>
            <p className="text-body-small text-gray-600 mt-1">Track all message sending activities and errors</p>
          </div>
          <button
            onClick={loadActivities}
            disabled={isLoading}
            className="flex items-center px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center space-x-3">
          <Filter className="w-4 h-4 text-gray-500" />
          <span className="text-sm text-gray-700">Filter by status:</span>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as 'all' | 'success' | 'error' | 'warning')}
            className="px-3 py-1 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="all">All Activities</option>
            <option value="success">Success</option>
            <option value="error">Errors</option>
            <option value="warning">Warnings</option>
          </select>
        </div>

        {/* Activities List */}
        <div className="tuco-section p-6">
          {isLoading ? (
            <div className="text-center py-8">
              <div className="text-gray-500">Loading activities...</div>
            </div>
          ) : filteredActivities.length > 0 ? (
            <div className="space-y-4">
              {filteredActivities.map((activity) => (
                <div key={activity._id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3">
                      <div className="flex items-center space-x-2">
                        {getStatusIcon(activity.status)}
                        {getTypeIcon(activity.type)}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-2">
                          <h3 className="font-medium text-gray-900">
                            {activity.description}
                          </h3>
                          {activity.scheduledDate && (
                            <div className="flex items-center text-xs text-gray-500">
                              <Calendar className="w-3 h-3 mr-1" />
                              Scheduled
                            </div>
                          )}
                        </div>
                        
                        <div className="text-sm text-gray-600 space-y-1">
                          {activity.recipientName && (
                            <div>
                              <span className="font-medium">To:</span> {activity.recipientName}
                              {activity.recipientEmail && ` (${activity.recipientEmail})`}
                              {activity.recipientPhone && ` (${activity.recipientPhone})`}
                            </div>
                          )}
                          
                          {activity.fromLinePhone && (
                            <div>
                              <span className="font-medium">From:</span> {activity.fromLinePhone}
                            </div>
                          )}
                          
                          {activity.messageContent && (
                            <div className="bg-gray-100 rounded p-2 mt-2">
                              <span className="font-medium">Message:</span> {activity.messageContent}
                            </div>
                          )}
                          
                          {activity.messageType && (
                            <div className="flex items-center space-x-1">
                              {getMessageTypeIcon(activity.messageType)}
                              <span className="text-xs text-gray-500 capitalize">{activity.messageType}</span>
                            </div>
                          )}
                          
                          {activity.errorMessage && (
                            <div className="text-red-600 text-sm mt-2">
                              <span className="font-medium">Error:</span> {activity.errorMessage}
                            </div>
                          )}
                          
                          {activity.externalMessageId && (
                            <div className="text-xs text-gray-500 mt-1">
                              <span className="font-medium">External ID:</span> {activity.externalMessageId}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <div className="text-xs text-gray-500">
                        {formatDate(activity.createdAt)}
                      </div>
                      {activity.batchId && (
                        <div className="text-xs text-gray-400 mt-1">
                          Batch: {activity.batchId.split('_')[1]}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Activity className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No activities found</h3>
              <p className="text-gray-600">
                {filter === 'all' 
                  ? 'No activities have been recorded yet.' 
                  : `No ${filter} activities found.`}
              </p>
            </div>
          )}
          
          {/* Pagination */}
          {filteredActivities.length > 0 && (
            <div className="flex items-center justify-between mt-6">
              <button 
                onClick={() => setPage(p => Math.max(1, p - 1))} 
                disabled={page === 1}
                className="flex items-center px-3 py-2 border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-50"
              >
                Previous
              </button>
              <div className="text-gray-600">Page {page} of {totalPages}</div>
              <button 
                onClick={() => setPage(p => Math.min(totalPages, p + 1))} 
                disabled={page >= totalPages}
                className="flex items-center px-3 py-2 border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-50"
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
