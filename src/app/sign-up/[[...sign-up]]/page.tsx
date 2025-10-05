import { SignUp } from '@clerk/nextjs';
import Link from 'next/link';

export default function SignUpPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center mr-3">
              <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" clipRule="evenodd" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Tuco AI</h1>
          </div>
          {/* Decorative pattern */}
          <div className="flex justify-center space-x-1 text-primary text-sm">
            <span>^</span>
            <span>_</span>
            <span>-</span>
            <span>+</span>
            <span>.</span>
            <span>^</span>
            <span>_</span>
            <span>-</span>
            <span>+</span>
            <span>.</span>
            <span>^</span>
            <span>_</span>
            <span>-</span>
            <span>+</span>
            <span>.</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex mb-6">
          <div className="flex-1 text-center">
            <Link href="/sign-in" className="text-gray-600 font-body-small py-2 px-4 rounded-lg cursor-pointer">
              Log In
            </Link>
          </div>
          <div className="flex-1 text-center">
            <div className="bg-gray-100 text-gray-900 font-body-small py-2 px-4 rounded-lg shadow-sm">
              Sign Up
            </div>
          </div>
        </div>

        {/* Sign Up Form */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <SignUp 
            appearance={{
              elements: {
                formButtonPrimary: 'bg-primary hover:bg-primary/90 text-white font-medium py-2 px-4 rounded-lg w-full transition-colors',
                card: 'shadow-none border-none bg-transparent',
                headerTitle: 'hidden',
                headerSubtitle: 'hidden',
                socialButtonsBlockButton: 'bg-black hover:bg-gray-800 text-white font-medium py-2 px-4 rounded-lg w-full mb-3 transition-colors',
                socialButtonsBlockButtonText: 'text-white',
                formFieldInput: 'border border-gray-300 rounded-lg px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent',
                formFieldLabel: 'text-gray-700 font-medium mb-1 block',
                footerActionLink: 'text-primary hover:text-primary/80',
                identityPreviewText: 'text-gray-600',
                formFieldInputShowPasswordButton: 'text-gray-500 hover:text-gray-700',
                dividerLine: 'bg-gray-200',
                dividerText: 'text-gray-500 text-sm',
              },
            }}
          />
        </div>

        {/* Terms */}
        <p className="text-center text-gray-500 text-body-small mt-6">
          By signing up, you agree to our{' '}
          <a href="#" className="text-gray-700 hover:text-gray-900">Terms of Service</a>
          {' '}and{' '}
          <a href="#" className="text-gray-700 hover:text-gray-900">Privacy Policy</a>
        </p>
      </div>
    </div>
  );
}
