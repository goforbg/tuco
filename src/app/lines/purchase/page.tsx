'use client';

import { useEffect, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Phone, PhoneIncoming, Loader2, Upload } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';

type Step = 'select' | 'details' | 'complete';

export default function PurchaseLinePage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('select');
  const [option, setOption] = useState<'byon' | 'buy' | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    profileImageUrl: '',
  });
  

  useEffect(() => {
    if (step === 'complete') {
      setAnimating(true);
      const t = setTimeout(() => setAnimating(false), 1800);
      return () => clearTimeout(t);
    }
  }, [step]);

  const goNextFromSelect = () => {
    if (!option || uploading || isSubmitting) return;
    setStep('details');
  };

  const submitPurchase = async () => {
    const isBuy = option === 'buy';
    const isByon = option === 'byon';
    const isBuyValid = form.firstName.trim() !== '' && form.lastName.trim() !== '';
    const isByonValid =
      form.firstName.trim() !== '' &&
      form.lastName.trim() !== '' &&
      form.email.trim() !== '' &&
      form.phone.trim() !== '' &&
      !!form.profileImageUrl;

    if (uploading) return;
    if ((isBuy && !isBuyValid) || (isByon && !isByonValid)) return;
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/lines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          // email and phone assigned during provisioning unless BYON
          email: option === 'byon' ? form.email : undefined,
          phone: option === 'byon' ? form.phone : undefined,
          profileImageUrl: form.profileImageUrl || undefined,
          lineType: option === 'buy' ? 'purchased' : 'byon', // map 'buy' to 'purchased'
        }),
      });
      if (res.ok) setStep('complete');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Purchase Line</h1>
            <p className="text-body-small text-gray-600 mt-1">Choose how you want to add a line</p>
          </div>
          <Link href="/lines" className="text-body-small text-primary hover:underline">Back to Lines</Link>
        </div>

        <div className="tuco-section p-6">
          {step === 'select' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  onClick={() => setOption('byon')}
                  className={`p-5 border rounded-xl transition-all cursor-pointer text-left ${option === 'byon' ? 'border-primary bg-primary-light' : 'border-gray-200 hover:bg-gray-50'}`}
                >
                  <div className="flex items-center mb-3">
                    <PhoneIncoming className="w-5 h-5 text-primary mr-2" />
                    <div className="font-medium text-gray-900">Bring my own number</div>
                  </div>
                  <div className="text-body-small text-gray-600">Port an existing phone number you own.</div>
                </button>
                <button
                  onClick={() => setOption('buy')}
                  className={`p-5 border rounded-xl transition-all cursor-pointer text-left ${option === 'buy' ? 'border-primary bg-primary-light' : 'border-gray-200 hover:bg-gray-50'}`}
                >
                  <div className="flex items-center mb-3">
                    <Phone className="w-5 h-5 text-primary mr-2" />
                    <div className="font-medium text-gray-900">Buy a new number</div>
                  </div>
                  <div className="text-body-small text-gray-600">Purchase a new dedicated phone number.</div>
                </button>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={goNextFromSelect}
                  disabled={!option}
                  className="px-4 py-2 bg-primary text-white rounded-lg disabled:opacity-60"
                >
                  Continue <ChevronRight className="w-4 h-4 inline ml-1" />
                </button>
              </div>
            </div>
          )}

          {step === 'details' && (
            <div className="space-y-5">
              <div className="flex items-center text-body-small text-gray-600">
                <button onClick={() => setStep('select')} className="text-primary flex items-center mr-2">
                  <ChevronLeft className="w-4 h-4 mr-1" /> Back
                </button>
                {option === 'byon' ? 'Bring my own number' : 'Buy a new number'}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">First name</label>
                  <input
                    value={form.firstName}
                    onChange={(e) => setForm(f => ({ ...f, firstName: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Jane"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Last name</label>
                  <input
                    value={form.lastName}
                    onChange={(e) => setForm(f => ({ ...f, lastName: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Doe"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    value={form.email}
                    disabled={option !== 'byon'}
                    onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
                    className={`w-full px-3 py-2 border rounded-lg focus:outline-none ${option !== 'byon' ? 'border-gray-200 bg-gray-50 text-gray-500' : 'border-gray-300 focus:ring-2 focus:ring-primary'}`}
                    placeholder={option === 'byon' ? 'Enter the email for this profile' : 'Assigned during provisioning'}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input
                    value={form.phone}
                    disabled={option !== 'byon'}
                    onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))}
                    className={`w-full px-3 py-2 border rounded-lg focus:outline-none ${option !== 'byon' ? 'border-gray-200 bg-gray-50 text-gray-500' : 'border-gray-300 focus:ring-2 focus:ring-primary'}`}
                    placeholder={option === 'byon' ? 'Enter your existing number to port' : 'Assigned during provisioning'}
                  />
                </div>
              </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Profile image</label>
                  <div className="flex items-center space-x-3">
                  <button
                    type="button"
                    onClick={async () => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = 'image/*';
                      input.onchange = async () => {
                        const file = input.files?.[0];
                        if (!file) return;
                        setUploading(true);
                        setUploadError('');
                        try {
                          const presign = await fetch('/api/uploads/s3', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ fileName: file.name, fileType: file.type })
                          });
                          if (!presign.ok) {
                            setUploadError('Could not get upload URL. Check S3 config.');
                            return;
                          }
                          const { uploadUrl, publicUrl, useAcl } = await presign.json();
                          try {
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
                              setUploadError('Upload failed. Verify S3 CORS and bucket policy (public-read)');
                              return;
                            }
                          } catch (e: unknown) {
                            const msg = e instanceof Error ? e.message : 'unknown error';
                            setUploadError(`Upload failed: ${msg}`);
                            return;
                          }
                          setForm(f => ({ ...f, profileImageUrl: publicUrl }));
                          if (previewUrl) URL.revokeObjectURL(previewUrl);
                          setPreviewUrl(URL.createObjectURL(file));
                        } finally {
                          setUploading(false);
                        }
                      };
                      input.click();
                    }}
                    disabled={uploading || isSubmitting}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                  >
                    {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <span className="flex items-center"><Upload className="w-4 h-4 mr-2" /> Upload</span>}
                  </button>
                  {previewUrl && (
                    <div className="w-12 h-12 rounded-lg overflow-hidden border border-gray-200">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={previewUrl} alt="Preview" className="w-12 h-12 object-cover" />
                    </div>
                  )}
                </div>
                {uploadError && (
                  <div className="mt-2 text-body-small text-red-600">{uploadError}</div>
                )}
              </div>
              <div className="flex justify-end">
                {option === 'byon' ? (
                  <></>
                ) : (
                  <></>
                )}
                <button
                  onClick={submitPurchase}
                  disabled={
                    isSubmitting ||
                    uploading ||
                    ((option === 'buy')
                      ? (form.firstName.trim() === '' || form.lastName.trim() === '')
                      : (form.firstName.trim() === '' || form.lastName.trim() === '' || form.email.trim() === '' || form.phone.trim() === '' || !form.profileImageUrl))
                  }
                  className="px-4 py-2 bg-primary text-white rounded-lg disabled:opacity-60"
                >
                  {isSubmitting ? <span className="flex items-center"><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Submitting...</span> : 'Submit'}
                </button>
              </div>
            </div>
          )}

          {step === 'complete' && (
            <div className="flex flex-col items-center py-16">
              <div className="relative w-20 h-20 mb-6">
                <div className="absolute inset-0 rounded-full bg-primary-light animate-ping" style={{ animationDuration: '1500ms' }} />
                <div className="relative w-20 h-20 rounded-full bg-primary flex items-center justify-center text-white">
                  <Check className={`w-8 h-8 ${animating ? 'scale-110 transition-transform' : ''}`} />
                </div>
              </div>
              <h2 className="text-xl font-semibold text-gray-900">Submitted</h2>
              <p className="text-body-small text-gray-600 mt-1 text-center max-w-sm">
                We’re setting up your machine. This typically takes 24–48 hours based on availability. You’ll get an email when it’s ready.
              </p>
              <div className="mt-6">
                <button onClick={() => router.push('/lines')} className="px-4 py-2 bg-primary text-white rounded-lg">Back to Lines</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}


