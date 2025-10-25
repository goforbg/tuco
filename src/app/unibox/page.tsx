'use client';

import { useState, useEffect } from 'react';
import { useUser } from '@clerk/nextjs';
import DashboardLayout from '@/components/DashboardLayout';

interface Message {
  _id: string;
  message: string;
  messageType: 'email' | 'sms' | 'imessage';
  recipientEmail?: string;
  recipientPhone?: string;
  recipientName?: string;
  fromLinePhone?: string;
  fromLineEmail?: string;
  status: 'pending' | 'sent' | 'failed' | 'delivered' | 'scheduled';
  createdAt: string;
  sentAt?: string;
  deliveredAt?: string;
  errorMessage?: string;
}

interface Conversation {
  id: string;
  recipient: string;
  recipientName?: string;
  recipientType: 'email' | 'phone';
  messages: Message[];
  lastMessageAt: string;
  unreadCount: number;
  status: 'active' | 'archived';
}

export default function UniboxPage() {
  const { user } = useUser();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [filter, setFilter] = useState<'all' | 'unread' | 'active' | 'archived'>('all');

  // Fetch conversations
  useEffect(() => {
    const fetchConversations = async () => {
      try {
        const response = await fetch('/api/unibox/conversations');
        if (response.ok) {
          const data = await response.json();
          setConversations(data.conversations || []);
        }
      } catch (error) {
        console.error('Error fetching conversations:', error);
      } finally {
        setLoading(false);
      }
    };

    if (user) {
      fetchConversations();
    }
  }, [user]);

  // Send a reply
  const handleSendReply = async () => {
    if (!selectedConversation || !newMessage.trim()) return;

    setSending(true);
    try {
      const response = await fetch('/api/unibox/send-reply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversationId: selectedConversation.id,
          message: newMessage.trim(),
        }),
      });

      if (response.ok) {
        setNewMessage('');
        // Refresh conversations to show the new message
        const updatedResponse = await fetch('/api/unibox/conversations');
        if (updatedResponse.ok) {
          const data = await updatedResponse.json();
          setConversations(data.conversations || []);
          
          // Update selected conversation
          const updatedConversation = data.conversations.find(
            (conv: Conversation) => conv.id === selectedConversation.id
          );
          if (updatedConversation) {
            setSelectedConversation(updatedConversation);
          }
        }
      } else {
        const error = await response.json();
        alert(`Error sending message: ${error.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error sending reply:', error);
      alert('Error sending message. Please try again.');
    } finally {
      setSending(false);
    }
  };

  // Filter conversations
  const filteredConversations = conversations.filter(conv => {
    switch (filter) {
      case 'unread':
        return conv.unreadCount > 0;
      case 'active':
        return conv.status === 'active';
      case 'archived':
        return conv.status === 'archived';
      default:
        return true;
    }
  });

  // Format timestamp
  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
    
    if (diffInHours < 24) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffInHours < 168) { // 7 days
      return date.toLocaleDateString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  // Get status color
  const getStatusColor = (status: Message['status']) => {
    switch (status) {
      case 'delivered':
        return 'text-green-600';
      case 'sent':
        return 'text-blue-600';
      case 'failed':
        return 'text-red-600';
      case 'pending':
        return 'text-yellow-600';
      case 'scheduled':
        return 'text-purple-600';
      default:
        return 'text-gray-600';
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <h1 className="text-2xl font-semibold text-gray-900">Unibox</h1>
          <p className="text-sm text-gray-600 mt-1">Unified inbox for all your conversations</p>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Conversations List */}
          <div className="w-1/3 border-r border-gray-200 bg-gray-50">
            {/* Filter Tabs */}
            <div className="p-4 border-b border-gray-200">
              <div className="flex space-x-1 bg-gray-100 rounded-lg p-1">
                {[
                  { key: 'all', label: 'All' },
                  { key: 'unread', label: 'Unread' },
                  { key: 'active', label: 'Active' },
                  { key: 'archived', label: 'Archived' },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setFilter(tab.key as 'all' | 'unread' | 'active' | 'archived')}
                    className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                      filter === tab.key
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Conversations */}
            <div className="flex-1 overflow-y-auto">
              {filteredConversations.length === 0 ? (
                <div className="p-4 text-center text-gray-500">
                  No conversations found
                </div>
              ) : (
                filteredConversations.map((conversation) => (
                  <div
                    key={conversation.id}
                    onClick={() => setSelectedConversation(conversation)}
                    className={`p-4 border-b border-gray-200 cursor-pointer hover:bg-gray-100 transition-colors ${
                      selectedConversation?.id === conversation.id ? 'bg-blue-50 border-blue-200' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-medium text-gray-900">
                        {conversation.recipientName || conversation.recipient}
                      </div>
                      <div className="text-xs text-gray-500">
                        {formatTimestamp(conversation.lastMessageAt)}
                      </div>
                    </div>
                    <div className="text-sm text-gray-600 mb-1">
                      {conversation.recipientType === 'phone' ? '📱' : '📧'} {conversation.recipient}
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-gray-500 truncate">
                        {conversation.messages[conversation.messages.length - 1]?.message || 'No messages'}
                      </div>
                      {conversation.unreadCount > 0 && (
                        <div className="bg-blue-600 text-white text-xs rounded-full px-2 py-1 min-w-[20px] text-center">
                          {conversation.unreadCount}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Conversation View */}
          <div className="flex-1 flex flex-col">
            {selectedConversation ? (
              <>
                {/* Conversation Header */}
                <div className="bg-white border-b border-gray-200 px-6 py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-medium text-gray-900">
                        {selectedConversation.recipientName || selectedConversation.recipient}
                      </h2>
                      <p className="text-sm text-gray-600">
                        {selectedConversation.recipientType === 'phone' ? '📱' : '📧'} {selectedConversation.recipient}
                      </p>
                    </div>
                    <div className="flex space-x-2">
                      <button className="px-3 py-1 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-md hover:bg-gray-50">
                        Archive
                      </button>
                      <button className="px-3 py-1 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-md hover:bg-gray-50">
                        More
                      </button>
                    </div>
                  </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                  {selectedConversation.messages.map((message) => (
                    <div
                      key={message._id}
                      className={`flex ${message.recipientPhone || message.recipientEmail ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                          message.recipientPhone || message.recipientEmail
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-200 text-gray-900'
                        }`}
                      >
                        <div className="text-sm">{message.message}</div>
                        <div className={`text-xs mt-1 ${
                          message.recipientPhone || message.recipientEmail
                            ? 'text-blue-100'
                            : 'text-gray-500'
                        }`}>
                          {formatTimestamp(message.createdAt)}
                          {message.status && (
                            <span className={`ml-2 ${getStatusColor(message.status)}`}>
                              • {message.status}
                            </span>
                          )}
                        </div>
                        {message.errorMessage && (
                          <div className="text-xs text-red-200 mt-1">
                            Error: {message.errorMessage}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Reply Input */}
                <div className="bg-white border-t border-gray-200 px-6 py-4">
                  <div className="flex space-x-4">
                    <input
                      type="text"
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleSendReply()}
                      placeholder="Type your reply..."
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      disabled={sending}
                    />
                    <button
                      onClick={handleSendReply}
                      disabled={!newMessage.trim() || sending}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {sending ? 'Sending...' : 'Send'}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-500">
                <div className="text-center">
                  <div className="text-4xl mb-4">💬</div>
                  <h3 className="text-lg font-medium mb-2">No conversation selected</h3>
                  <p>Choose a conversation from the list to start chatting</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
