'use client';

import { useEffect, useState } from 'react';
import { Plus, Smartphone, CheckCircle2, Pencil, Loader2, X, Upload, Activity, ChevronDown, ChevronUp } from 'lucide-react';
import Link from 'next/link';
import { useOrganization } from '@clerk/nextjs';
import DashboardLayout from '@/components/DashboardLayout';

type LineData = {
  _id: string;
  workspaceId: string;
  createdByUserId: string;
  createdUserId?: string;
  phone: string;
  email: string;
  firstName: string;
  lastName: string;
  profileImageUrl?: string;
  isActive: boolean;
  provisioningStatus: 'provisioning' | 'active' | 'failed';
  provisioningSubmittedAt?: string;
  estimatedReadyAt?: string;
  billingType?: 'free' | 'paid';
  dailyNewConversationsLimit: number;
  dailyTotalMessagesLimit: number;
  usage?: {
    date: string;
    newConversationsCount: number;
    totalMessagesCount: number;
  };
  healthCheck?: {
    lastCheckedAt?: string;
    status?: 'healthy' | 'down';
    consecutiveFailures?: number;
    lastEmailSentAt?: string;
    lastHealthyAt?: string;
  };
  createdAt: string;
  updatedAt: string;
};

type FormData = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  profileImageUrl: string;
};

export default function LinesPage() {
  const { organization } = useOrganization();
  const [lines, setLines] = useState<LineData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [editingLine, setEditingLine] = useState<LineData | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(
    { firstName: '', lastName: '', email: '', phone: '', profileImageUrl: '' }
  );
  const [editUploading, setEditUploading] = useState(false);
  const [editUploadError, setEditUploadError] = useState('');
  const [editPreviewUrl, setEditPreviewUrl] = useState('');
  const [expandedHealthId, setExpandedHealthId] = useState<string | null>(null);

  // Form state for purchase/edit
  // Purchase moved to separate page

  const loadLines = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/lines');
      if (res.ok) {
        const data = await res.json();
        setLines((data.lines || []).map((l: LineData) => ({ ...l })));
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadLines();
  }, [organization?.id]);

  // const activeLines = useMemo(() => lines.filter(l => l.isActive), [lines]);

  // Purchase handled on /lines/purchase

  const openEdit = (line: LineData) => {
    setEditingLine(line);
    setForm({
      firstName: line.firstName || '',
      lastName: line.lastName || '',
      email: line.email || '',
      phone: line.phone || '',
      profileImageUrl: line.profileImageUrl || '',
    });
  };

  const closeEdit = () => setEditingLine(null);

  const handleSaveEdit = async () => {
    if (!editingLine) return;
    if (editUploading) return;
    setIsSaving(true);
    try {
      const res = await fetch('/api/lines', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          _id: editingLine._id,
          firstName: form.firstName,
          lastName: form.lastName,
          profileImageUrl: form.profileImageUrl || undefined,
        }),
      });
      if (res.ok) {
        closeEdit();
        await loadLines();
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemove = async (id: string) => {
    setRemovingId(id);
    try {
      const res = await fetch(`/api/lines?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (res.ok) {
        await loadLines();
      }
    } finally {
      setRemovingId(null);
    }
  };

  const getHealthStatusBadge = (healthCheck?: LineData['healthCheck']) => {
    if (!healthCheck || !healthCheck.status) {
      return null;
    }

    const status = healthCheck.status;
    
    if (status === 'healthy') {
      return (
        <div className="flex items-center space-x-1.5 text-green-600">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs font-medium">Healthy</span>
        </div>
      );
    } else if (status === 'down') {
      return (
        <div className="flex items-center space-x-1.5 text-red-600">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-xs font-medium">Down</span>
        </div>
      );
    }
    
    return null;
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Never';
    try {
      const date = new Date(dateString);
      const day = date.getDate().toString().padStart(2, '0');
      const month = date.toLocaleDateString('en-US', { month: 'short' });
      const year = date.getFullYear();
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      return `${day}-${month}-${year} ${hours}:${minutes}`;
    } catch {
      return 'Invalid date';
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto space-y-6 pb-24">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Lines</h1>
            <p className="text-body-small text-gray-600 mt-1">Manage purchased lines for your organization</p>
          </div>
          <div className="flex space-x-3">
            <Link href="/lines/purchase" className="flex items-center px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors cursor-pointer">
              <Plus className="w-4 h-4 mr-2" />
              <span className="text-body-small font-body-small">Purchase Line</span>
            </Link>
          </div>
        </div>

        {/* Content */}
        <div className="tuco-section p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-gray-500">
              <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Loading lines...
            </div>
          ) : lines.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-14 h-14 rounded-full bg-primary-light flex items-center justify-center mb-4">
                <Smartphone className="w-7 h-7 text-primary" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900">No lines yet</h2>
              <p className="text-body-small text-gray-600 mt-1">Purchase a new line to get started</p>
              <Link href="/lines/purchase" className="mt-4 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors cursor-pointer">
                Purchase Line
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {lines.map((line) => {
                const isProvisioning = line.provisioningStatus === 'provisioning';
                const etaText = line.estimatedReadyAt || undefined;
                const usageNew = line.usage?.newConversationsCount ?? 0;
                const usageTotal = line.usage?.totalMessagesCount ?? 0;
                return (
                <div key={line._id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                  <div className="flex items-center">
                    <div className="w-10 h-10 rounded-full bg-gray-100 overflow-hidden mr-3">
                      {line.profileImageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={line.profileImageUrl} alt="" className="w-10 h-10 object-cover" />
                      ) : (
                        <div className="w-10 h-10 flex items-center justify-center text-gray-400">
                          <Smartphone className="w-5 h-5" />
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-medium text-gray-900">
                          {line.firstName} {line.lastName}
                        </span>
                        {line.isActive && line.provisioningStatus === 'active' && (
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                        )}
                        {isProvisioning && (
                          <span className="inline-flex items-center text-body-small text-amber-600">
                            <span className="relative mr-1 inline-flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
                            </span>
                            Provisioning
                          </span>
                        )}
                      </div>
                      <div className="text-body-small text-gray-600">
                        {line.phone} • {line.email}
                      </div>
                      <div className="text-body-small text-gray-500 mt-1 flex flex-col sm:flex-row sm:items-center sm:space-x-3">
                        <span>Daily limits: {line.dailyNewConversationsLimit} new, {line.dailyTotalMessagesLimit} total</span>
                        <span className="hidden sm:inline text-gray-300">|</span>
                        <span>Today: {usageNew}/{line.dailyNewConversationsLimit} new, {usageTotal}/{line.dailyTotalMessagesLimit} total</span>
                        {isProvisioning && (
                          <span className="text-amber-600">• ETA: {etaText ?? '24–48 hours'}</span>
                        )}
                      </div>
                      {/* Health Check Status */}
                      {line.isActive && line.provisioningStatus === 'active' && line.healthCheck && (
                        <div className="mt-2">
                          <button
                            onClick={() => setExpandedHealthId(expandedHealthId === line._id ? null : line._id)}
                            className="flex items-center space-x-2 text-body-small text-gray-600 hover:text-gray-900 transition-colors"
                          >
                            <Activity className="w-3.5 h-3.5" />
                            <span className="flex items-center space-x-2">
                              {getHealthStatusBadge(line.healthCheck)}
                              <span className="text-gray-400">• Last checked: {formatDate(line.healthCheck.lastCheckedAt)}</span>
                            </span>
                            {expandedHealthId === line._id ? (
                              <ChevronUp className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5" />
                            )}
                          </button>
                          {/* Health Check Details */}
                          {expandedHealthId === line._id && (
                            <div className="mt-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
                              <div className="text-xs space-y-1.5">
                                <div className="flex justify-between">
                                  <span className="text-gray-600">Status:</span>
                                  <span className="font-medium">{line.healthCheck.status || 'Unknown'}</span>
                                </div>
                                {line.healthCheck.lastCheckedAt && (
                                  <div className="flex justify-between">
                                    <span className="text-gray-600">Last Checked:</span>
                                    <span className="font-medium">{formatDate(line.healthCheck.lastCheckedAt)}</span>
                                  </div>
                                )}
                                {line.healthCheck.consecutiveFailures !== undefined && line.healthCheck.consecutiveFailures > 0 && (
                                  <div className="flex justify-between">
                                    <span className="text-gray-600">Consecutive Failures:</span>
                                    <span className="font-medium text-red-600">{line.healthCheck.consecutiveFailures}</span>
                                  </div>
                                )}
                                {line.healthCheck.lastEmailSentAt && (
                                  <div className="flex justify-between">
                                    <span className="text-gray-600">Last Notification:</span>
                                    <span className="font-medium">{formatDate(line.healthCheck.lastEmailSentAt)}</span>
                                  </div>
                                )}
                                {line.healthCheck.lastHealthyAt && (
                                  <div className="flex justify-between">
                                    <span className="text-gray-600">Last Healthy:</span>
                                    <span className="font-medium text-green-600">{formatDate(line.healthCheck.lastHealthyAt)}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button onClick={() => openEdit(line)} className="px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        if (removingId) return;
                        const ok = window.confirm('Are you sure you want to request deletion of this line? This action cannot be undone.');
                        if (ok) handleRemove(line._id);
                      }}
                      disabled={removingId === line._id}
                      className="px-3 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-60 transition-colors cursor-pointer"
                    >
                      {removingId === line._id ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Remove'}
                    </button>
                  </div>
                </div>
              );})}
            </div>
          )}
        </div>
      </div>

      {/* Purchase drawer removed; handled in /lines/purchase */}

      {/* Edit Drawer */}
      {editingLine && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" onClick={closeEdit} />
          <div className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-xl p-6 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Edit Line</h3>
              <button onClick={closeEdit} className="p-2 text-gray-500 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 rounded-full bg-gray-100 overflow-hidden">
                  {(editPreviewUrl || form.profileImageUrl) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={editPreviewUrl || form.profileImageUrl} alt="" className="w-12 h-12 object-cover" />
                  ) : (
                    <div className="w-12 h-12 flex items-center justify-center text-gray-400">
                      <Smartphone className="w-6 h-6" />
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/*';
                    input.onchange = async () => {
                      const file = input.files?.[0];
                      if (!file) return;
                      setEditUploading(true);
                      setEditUploadError('');
                      try {
                        const presign = await fetch('/api/uploads/s3', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ fileName: file.name, fileType: file.type })
                        });
                        if (!presign.ok) {
                          setEditUploadError('Could not get upload URL. Check S3 config.');
                          return;
                        }
                        const { uploadUrl, publicUrl, useAcl } = await presign.json();
                        const putRes = await fetch(uploadUrl, {
                          method: 'PUT',
                          mode: 'cors',
                          headers: {
                            'Content-Type': file.type,
                            ...(useAcl ? { 'x-amz-acl': 'public-read' } : {}),
                          },
                          body: file,
                        });
                        if (!putRes.ok) {
                          setEditUploadError('Upload failed. Verify S3 CORS and bucket policy.');
                          return;
                        }
                        if (editPreviewUrl) URL.revokeObjectURL(editPreviewUrl);
                        setEditPreviewUrl(URL.createObjectURL(file));
                        setForm((f: FormData) => ({ ...f, profileImageUrl: publicUrl }));
                      } catch (e: unknown) {
                        const msg = e instanceof Error ? e.message : 'unknown error';
                        setEditUploadError(`Upload failed: ${msg}`);
                      } finally {
                        setEditUploading(false);
                      }
                    };
                    input.click();
                  }}
                  disabled={editUploading || isSaving}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                >
                  {editUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <span className="flex items-center"><Upload className="w-4 h-4 mr-2" /> Upload</span>}
                </button>
              </div>
              {editUploadError && (
                <div className="text-body-small text-red-600">{editUploadError}</div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">First name</label>
                <input
                  value={form.firstName}
                  onChange={(e) => setForm((f: FormData) => ({ ...f, firstName: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Last name</label>
                <input
                  value={form.lastName}
                  onChange={(e) => setForm((f: FormData) => ({ ...f, lastName: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input value={form.phone} disabled className="w-full px-3 py-2 border border-gray-200 bg-gray-50 rounded-lg text-gray-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input value={form.email} disabled className="w-full px-3 py-2 border border-gray-200 bg-gray-50 rounded-lg text-gray-500" />
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end space-x-2">
              <button
                onClick={closeEdit}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={isSaving || editUploading}
                className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-70 transition-colors cursor-pointer"
              >
                {isSaving ? <span className="flex items-center"><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</span> : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}


