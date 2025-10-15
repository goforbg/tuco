'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { 
  ArrowRight, 
  ArrowLeft,
  CheckCircle, 
  Users,
  MessageSquare,
  Smartphone,
  Settings as SettingsIcon,
  Clock,
  Calendar,
  Zap,
  Plus,
  Eye
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import DashboardLayout from '@/components/DashboardLayout';

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

interface CampaignSettings {
  sendImmediately: boolean;
  scheduledDate?: string;
  scheduledTime?: string;
  gapBetweenMessages: number; // in seconds
  randomizeOrder: boolean;
}

type Step = 'list' | 'message' | 'senders' | 'review';

function CampaignsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const listIdFromUrl = searchParams.get('listId');

  // Step management
  const [currentStep, setCurrentStep] = useState<Step>('list');

  // Step 1: List selection
  const [lists, setLists] = useState<ListData[]>([]);
  const [selectedListId, setSelectedListId] = useState<string>(listIdFromUrl || '');

  // Step 2: Message
  const [messageText, setMessageText] = useState('');

  // Step 3: Senders/Lines
  const [lines, setLines] = useState<LineData[]>([]);
  const [selectedLineIds, setSelectedLineIds] = useState<string[]>([]);

  // Step 4: Settings
  const [campaignSettings, setCampaignSettings] = useState<CampaignSettings>({
    sendImmediately: true,
    gapBetweenMessages: 30, // 30 seconds default
    randomizeOrder: false
  });

  // Loading states
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    loadLists();
    loadLines();
  }, []);

  // If listId is provided in URL, skip to message step
  useEffect(() => {
    if (listIdFromUrl && lists.length > 0) {
      const listExists = lists.find(l => l._id === listIdFromUrl);
      if (listExists) {
        setSelectedListId(listIdFromUrl);
        setCurrentStep('message');
      }
    }
  }, [listIdFromUrl, lists]);

  const loadLists = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/lists');
      if (response.ok) {
        const data = await response.json();
        setLists(data.lists || []);
      }
    } catch (error) {
      console.error('Error loading lists:', error);
      toast.error('Failed to load lists');
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
      }
    } catch (error) {
      console.error('Error loading lines:', error);
      toast.error('Failed to load lines');
    }
  };


  const handleListContinue = () => {
    // Continue with existing list
    if (!selectedListId) {
      toast.error('Please select a list');
      return;
    }
    setCurrentStep('message');
  };

  const handleMessageContinue = () => {
    if (!messageText.trim()) {
      toast.error('Please enter a message');
      return;
    }
    setCurrentStep('senders');
  };

  const handleSendersContinue = () => {
    if (selectedLineIds.length === 0) {
      toast.error('Please select at least one sender');
      return;
    }
    setCurrentStep('review');
  };

  const handleLaunchCampaign = async () => {
    try {
      setIsSubmitting(true);

      const campaignData = {
        listId: selectedListId,
        message: messageText,
        lineIds: selectedLineIds,
        settings: campaignSettings
      };

      const response = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(campaignData),
      });

      if (response.ok) {
        await response.json();
        toast.success(campaignSettings.sendImmediately ? 'Campaign launched successfully!' : 'Campaign scheduled successfully!');
        router.push('/campaigns'); // Navigate to campaigns list page (to be implemented)
      } else {
        const errorData = await response.json();
        toast.error(errorData.error || 'Failed to launch campaign');
      }
    } catch (error) {
      console.error('Error launching campaign:', error);
      toast.error('Failed to launch campaign');
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleLineSelection = (lineId: string) => {
    setSelectedLineIds(prev => 
      prev.includes(lineId) 
        ? prev.filter(id => id !== lineId)
        : [...prev, lineId]
    );
  };

  const getSelectedList = () => lists.find(l => l._id === selectedListId);

  // Step Progress Indicator
  const steps = [
    { id: 'list', label: 'Select List', icon: Users },
    { id: 'message', label: 'Compose Message', icon: MessageSquare },
    { id: 'senders', label: 'Choose Senders', icon: Smartphone },
    { id: 'review', label: 'Review & Launch', icon: Eye },
  ];

  const currentStepIndex = steps.findIndex(s => s.id === currentStep);

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto space-y-6 pb-24">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Create Campaign</h1>
            <p className="text-body-small text-gray-600 mt-1">
              Send messages to your leads at scale
            </p>
          </div>
        </div>

        {/* Progress Steps */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            {steps.map((step, index) => {
              const Icon = step.icon;
              const isCompleted = index < currentStepIndex;
              const isCurrent = index === currentStepIndex;
              
              return (
                <React.Fragment key={step.id}>
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                        isCompleted
                          ? 'bg-green-100 text-green-600'
                          : isCurrent
                          ? 'bg-primary text-white'
                          : 'bg-gray-100 text-gray-400'
                      }`}
                    >
                      {isCompleted ? (
                        <CheckCircle className="w-6 h-6" />
                      ) : (
                        <Icon className="w-6 h-6" />
                      )}
                    </div>
                    <p
                      className={`text-sm mt-2 ${
                        isCurrent ? 'text-gray-900 font-medium' : 'text-gray-500'
                      }`}
                    >
                      {step.label}
                    </p>
                  </div>
                  {index < steps.length - 1 && (
                    <div
                      className={`flex-1 h-1 mx-4 rounded transition-colors ${
                        isCompleted ? 'bg-green-500' : 'bg-gray-200'
                      }`}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Step Content */}
        <div className="bg-white rounded-lg border border-gray-200 p-8">
          {/* Step 1: List Selection */}
          {currentStep === 'list' && (
            <div className="space-y-6">
              <div className="text-center mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-2">Select a List</h2>
                <p className="text-gray-600">Choose which leads to send messages to</p>
              </div>

              <div className="space-y-6">
                {/* Existing Lists Section */}
                <div className="bg-white rounded-lg border border-gray-200 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base font-semibold text-gray-900">Select from existing lists</h3>
                    {lists.length > 0 && (
                      <span className="text-sm text-gray-500">{lists.length} lists available</span>
                    )}
                  </div>
                
                  <div>
                    <div className="mt-4">
                      {isLoading ? (
                        <div className="text-center py-12">
                          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-primary border-t-transparent"></div>
                          <p className="text-gray-500 mt-3">Loading lists...</p>
                        </div>
                      ) : lists.length > 0 ? (
                        <>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-96 overflow-y-auto pr-2">
                            {lists.map((list) => (
                              <div
                                key={list._id}
                                onClick={() => setSelectedListId(list._id)}
                                className={`group relative p-5 rounded-xl cursor-pointer transition-all duration-200 ${
                                  selectedListId === list._id
                                    ? 'bg-primary-light border-2 border-primary shadow-md'
                                    : 'bg-gray-50 border-2 border-gray-200 hover:border-primary/50 hover:shadow-sm'
                                }`}
                              >
                                <div className="flex items-start justify-between">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center space-x-2 mb-2">
                                      <Users className={`w-4 h-4 flex-shrink-0 ${
                                        selectedListId === list._id ? 'text-primary' : 'text-gray-400'
                                      }`} />
                                      <h3 className={`font-semibold truncate ${
                                        selectedListId === list._id ? 'text-primary' : 'text-gray-900'
                                      }`}>
                                        {list.name}
                                      </h3>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                      <span className={`text-2xl font-bold ${
                                        selectedListId === list._id ? 'text-primary' : 'text-gray-900'
                                      }`}>
                                        {list.leadCount}
                                      </span>
                                      <span className="text-sm text-gray-500">
                                        {list.leadCount === 1 ? 'lead' : 'leads'}
                                      </span>
                                    </div>
                                    {list.description && (
                                      <p className="text-xs text-gray-500 mt-2 line-clamp-2">
                                        {list.description}
                                      </p>
                                    )}
                                  </div>
                                  {selectedListId === list._id && (
                                    <CheckCircle className="w-6 h-6 text-primary flex-shrink-0 ml-2" />
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                          {lists.length > 6 && (
                            <div className="mt-3 text-center">
                              <p className="text-xs text-gray-500">Scroll to see more lists</p>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                          <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                          <h3 className="text-lg font-medium text-gray-900 mb-2">No lists found</h3>
                          <p className="text-sm text-gray-600 mb-4">Create your first list to get started</p>
                          <button
                            onClick={() => router.push('/leads/import')}
                            className="inline-flex items-center px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
                          >
                            <Plus className="w-4 h-4 mr-2" />
                            Import Leads
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Create New List Section */}
                <div className="bg-white rounded-lg border border-gray-200 p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-semibold text-gray-900 mb-1">Don&apos;t have a list yet?</h3>
                      <p className="text-sm text-gray-600">Import leads and create a new list</p>
                    </div>
                    <button
                      onClick={() => router.push('/leads/import')}
                      className="inline-flex items-center px-5 py-2.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors font-medium"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Create New List
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-6 border-t border-gray-200">
                <button
                  onClick={handleListContinue}
                  disabled={!selectedListId}
                  className="flex items-center px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium shadow-sm"
                >
                  Continue
                  <ArrowRight className="w-4 h-4 ml-2" />
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Message Composition */}
          {currentStep === 'message' && (
            <div className="space-y-6">
              <div className="text-center mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-2">Compose Your Message</h2>
                <p className="text-gray-600">Write the message you want to send to your leads</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Message Content
                  </label>
                  <textarea
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    placeholder="Type your message here... You can use variables like {firstName}, {lastName}, {companyName}"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    rows={8}
                  />
                  <p className="text-sm text-gray-500 mt-2">
                    {messageText.length} characters
                  </p>
                </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h3 className="font-medium text-blue-900 mb-2">Available Variables</h3>
                  <div className="text-sm text-blue-800 space-y-1">
                    <p><code className="bg-white px-2 py-0.5 rounded">{'{firstName}'}</code> - Lead&apos;s first name</p>
                    <p><code className="bg-white px-2 py-0.5 rounded">{'{lastName}'}</code> - Lead&apos;s last name</p>
                    <p><code className="bg-white px-2 py-0.5 rounded">{'{companyName}'}</code> - Lead&apos;s company</p>
                    <p><code className="bg-white px-2 py-0.5 rounded">{'{email}'}</code> - Lead&apos;s email</p>
                  </div>
                </div>
              </div>

              <div className="flex justify-between pt-6 border-t border-gray-200">
                <button
                  onClick={() => setCurrentStep('list')}
                  className="flex items-center px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </button>
                <button
                  onClick={handleMessageContinue}
                  disabled={!messageText.trim()}
                  className="flex items-center px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                >
                  Continue
                  <ArrowRight className="w-4 h-4 ml-2" />
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Sender Selection */}
          {currentStep === 'senders' && (
            <div className="space-y-6">
              <div className="text-center mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-2">Choose Senders</h2>
                <p className="text-gray-600">Select which lines will send messages for this campaign</p>
              </div>

              <div className="space-y-4">
                {lines.filter(line => line.isActive && line.provisioningStatus === 'active').length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {lines
                      .filter(line => line.isActive && line.provisioningStatus === 'active')
                      .map((line) => (
                        <div
                          key={line._id}
                          onClick={() => toggleLineSelection(line._id)}
                          className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                            selectedLineIds.includes(line._id)
                              ? 'border-primary bg-primary-light'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              <div className="w-10 h-10 bg-primary-light rounded-full flex items-center justify-center">
                                <Smartphone className="w-5 h-5 text-primary" />
                              </div>
                              <div>
                                <h3 className="font-medium text-gray-900">
                                  {line.firstName} {line.lastName}
                                </h3>
                                <p className="text-sm text-gray-500">{line.phone}</p>
                              </div>
                            </div>
                            {selectedLineIds.includes(line._id) && (
                              <CheckCircle className="w-5 h-5 text-primary" />
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Smartphone className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600 mb-4">No active lines available</p>
                    <button
                      onClick={() => router.push('/lines')}
                      className="inline-flex items-center px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add a Line
                    </button>
                  </div>
                )}

                {selectedLineIds.length > 0 && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <p className="text-sm text-green-800">
                      <CheckCircle className="w-4 h-4 inline mr-2" />
                      {selectedLineIds.length} {selectedLineIds.length === 1 ? 'line' : 'lines'} selected. 
                      Messages will be distributed evenly across selected lines.
                    </p>
                  </div>
                )}
              </div>

              <div className="flex justify-between pt-6 border-t border-gray-200">
                <button
                  onClick={() => setCurrentStep('message')}
                  className="flex items-center px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </button>
                <button
                  onClick={handleSendersContinue}
                  disabled={selectedLineIds.length === 0}
                  className="flex items-center px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                >
                  Continue
                  <ArrowRight className="w-4 h-4 ml-2" />
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Review & Settings */}
          {currentStep === 'review' && (
            <div className="space-y-6">
              <div className="text-center mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-2">Review & Configure</h2>
                <p className="text-gray-600">Review your campaign and configure advanced settings</p>
              </div>

              {/* Campaign Overview */}
              <div className="space-y-4">
                <div className="bg-gray-50 rounded-lg p-6 space-y-4">
                  <h3 className="font-semibold text-gray-900 mb-4">Campaign Overview</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex items-start space-x-3">
                      <Users className="w-5 h-5 text-primary mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-gray-700">Target List</p>
                        <p className="text-sm text-gray-900 mt-1">
                          {getSelectedList()?.name} ({getSelectedList()?.leadCount} leads)
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start space-x-3">
                      <Smartphone className="w-5 h-5 text-primary mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-gray-700">Senders</p>
                        <p className="text-sm text-gray-900 mt-1">
                          {selectedLineIds.length} {selectedLineIds.length === 1 ? 'line' : 'lines'} selected
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start space-x-3 md:col-span-2">
                      <MessageSquare className="w-5 h-5 text-primary mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-700">Message Preview</p>
                        <div className="mt-2 p-3 bg-white border border-gray-200 rounded text-sm text-gray-900 whitespace-pre-wrap">
                          {messageText}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Advanced Settings */}
                <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-6">
                  <h3 className="font-semibold text-gray-900 flex items-center">
                    <SettingsIcon className="w-5 h-5 mr-2 text-primary" />
                    Advanced Settings
                  </h3>

                  {/* Scheduling */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium text-gray-900">Scheduling</h4>
                        <p className="text-sm text-gray-600 mt-1">Choose when to send messages</p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <label className="flex items-center space-x-3 p-3 border-2 border-gray-200 rounded-lg cursor-pointer hover:border-primary transition-colors">
                        <input 
                          type="radio" 
                          name="scheduling"
                          checked={campaignSettings.sendImmediately}
                          onChange={() => setCampaignSettings(prev => ({ ...prev, sendImmediately: true }))}
                          className="h-4 w-4"
                        />
                        <div>
                          <p className="font-medium text-gray-900">Send Now</p>
                          <p className="text-sm text-gray-600">Start sending messages immediately</p>
                        </div>
                      </label>

                      <label className="flex items-center space-x-3 p-3 border-2 border-gray-200 rounded-lg cursor-pointer hover:border-primary transition-colors">
                        <input 
                          type="radio" 
                          name="scheduling"
                          checked={!campaignSettings.sendImmediately}
                          onChange={() => setCampaignSettings(prev => ({ ...prev, sendImmediately: false }))}
                          className="h-4 w-4"
                        />
                        <div className="flex-1">
                          <p className="font-medium text-gray-900">Schedule for Later</p>
                          <p className="text-sm text-gray-600">Choose a specific date and time</p>
                        </div>
                      </label>

                      {!campaignSettings.sendImmediately && (
                        <div className="pl-8 grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              <Calendar className="w-4 h-4 inline mr-1" />
                              Date
                            </label>
                            <input
                              type="date"
                              value={campaignSettings.scheduledDate || ''}
                              onChange={(e) => setCampaignSettings(prev => ({ 
                                ...prev, 
                                scheduledDate: e.target.value 
                              }))}
                              min={new Date().toISOString().split('T')[0]}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              <Clock className="w-4 h-4 inline mr-1" />
                              Time
                            </label>
                            <input
                              type="time"
                              value={campaignSettings.scheduledTime || ''}
                              onChange={(e) => setCampaignSettings(prev => ({ 
                                ...prev, 
                                scheduledTime: e.target.value 
                              }))}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Message Gap */}
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-medium text-gray-900 mb-2">Message Delivery Gap</h4>
                      <p className="text-sm text-gray-600 mb-3">Time delay between each message (in seconds)</p>
                      <div className="flex items-center space-x-4">
                        <input
                          type="number"
                          min="1"
                          max="3600"
                          value={campaignSettings.gapBetweenMessages}
                          onChange={(e) => setCampaignSettings(prev => ({ 
                            ...prev, 
                            gapBetweenMessages: parseInt(e.target.value) || 30 
                          }))}
                          className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                        />
                        <span className="text-sm text-gray-600">seconds</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-2">
                        Recommended: 30-60 seconds to avoid rate limits
                      </p>
                    </div>
                  </div>

                  {/* Randomize Order */}
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium text-gray-900">Randomize Send Order</h4>
                      <p className="text-sm text-gray-600 mt-1">Send messages in random order instead of sequential</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={campaignSettings.randomizeOrder}
                        onChange={(e) => setCampaignSettings(prev => ({ 
                          ...prev, 
                          randomizeOrder: e.target.checked 
                        }))}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                    </label>
                  </div>
                </div>

                {/* Estimated Time */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-start space-x-3">
                    <Clock className="w-5 h-5 text-blue-600 mt-0.5" />
                    <div>
                      <p className="font-medium text-blue-900">Estimated Completion Time</p>
                      <p className="text-sm text-blue-800 mt-1">
                        Approximately {Math.ceil((getSelectedList()?.leadCount || 0) * campaignSettings.gapBetweenMessages / 60)} minutes
                        {' '}({getSelectedList()?.leadCount || 0} messages × {campaignSettings.gapBetweenMessages}s gap)
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-between pt-6 border-t border-gray-200">
                <button
                  onClick={() => setCurrentStep('senders')}
                  className="flex items-center px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </button>
                <div className="flex space-x-3">
                  <button
                    onClick={handleLaunchCampaign}
                    disabled={
                      isSubmitting || 
                      (!campaignSettings.sendImmediately && (!campaignSettings.scheduledDate || !campaignSettings.scheduledTime))
                    }
                    className="flex items-center px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                  >
                    {isSubmitting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                        Launching...
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4 mr-2" />
                        {campaignSettings.sendImmediately ? 'Launch Campaign' : 'Schedule Campaign'}
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

export default function CampaignsPage() {
  return (
    <Suspense fallback={
      <DashboardLayout>
        <div className="max-w-6xl mx-auto space-y-6 pb-24">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Create Campaign</h1>
              <p className="text-body-small text-gray-600 mt-1">Loading...</p>
            </div>
          </div>
        </div>
      </DashboardLayout>
    }>
      <CampaignsContent />
    </Suspense>
  );
}

