'use client';

import { Bell, HelpCircle, FileText, ArrowUp, Menu } from 'lucide-react';

interface TopBarProps {
  onMenuToggle: () => void;
  isMobile: boolean;
}

export default function TopBar({ onMenuToggle, isMobile }: TopBarProps) {
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
              <span className="text-xs font-medium text-white">P</span>
            </div>
            <span className="text-body-small font-body-small text-gray-900 hidden sm:inline">Personal Team</span>
          </div>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right: Actions */}
        <div className="flex items-center space-x-2 md:space-x-3">
          <button className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer">
            <Bell className="icon-24" />
          </button>

          <button className="hidden md:flex items-center px-3 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer">
            <HelpCircle className="icon-24 mr-2" />
            <span className="text-body-small font-body-small">Help</span>
          </button>

          <button className="hidden md:flex items-center px-3 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer">
            <FileText className="icon-24 mr-2" />
            <span className="text-body-small font-body-small">Docs</span>
          </button>

          <button className="flex items-center px-3 md:px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors cursor-pointer">
            <ArrowUp className="icon-24 mr-2" />
            <span className="text-body-small font-body-small hidden sm:inline">Upgrade</span>
          </button>
        </div>
      </div>
    </div>
  );
}
