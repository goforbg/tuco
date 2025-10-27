'use client';

import { HelpCircle, FileText, Menu } from 'lucide-react';
import { useOrganization } from '@clerk/nextjs';

interface TopBarProps {
  onMenuToggle: () => void;
  isMobile: boolean;
}

export default function TopBar({ onMenuToggle, isMobile }: TopBarProps) {
  const { organization } = useOrganization();
  const workspaceSlug = organization?.slug || 'workspace';
  const badgeInitial = workspaceSlug.charAt(0).toUpperCase();
  

  return (
    <div className="bg-white border-b border-gray-200 px-4 md:px-6 h-16 flex items-center">
      <div className="w-full flex items-center">
        {/* Left: Menu + Team */}
        <div className="flex items-center space-x-4">
          {isMobile && (
            <button
              onClick={onMenuToggle}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
            >
              <Menu className="icon-24" />
            </button>
          )}

          <div className="flex items-center px-3 py-1 bg-gray-100 rounded-lg">
            <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center mr-2">
              <span className="text-xs font-medium text-white">{badgeInitial}</span>
            </div>
            <span className="text-body-small font-body-small text-gray-900 hidden sm:inline">{workspaceSlug}</span>
          </div>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right: Actions */}
        <div className="flex items-center space-x-2 md:space-x-3">
          <a 
            href="mailto:bharadwaj@inboxpiratesconsulting.com?subject=Tuco Help Request&body=You can also reach me via WhatsApp/iMessage at +91 9042956129"
            className="hidden md:flex items-center px-3 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
          >
            <HelpCircle className="icon-24 mr-2" />
            <span className="text-body-small font-body-small">Help</span>
          </a>

          <a 
            href="https://docs.tuco.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden md:flex items-center px-3 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
          >
            <FileText className="icon-24 mr-2" />
            <span className="text-body-small font-body-small">Docs</span>
          </a>
        </div>
      </div>
    </div>
  );
}
