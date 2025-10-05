'use client';

import { useState } from 'react';
import { useUser } from '@clerk/nextjs';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  Search, 
  Home, 
  Users, 
  Activity, 
  BarChart3, 
  Key, 
  Settings, 
  Megaphone, 
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

interface SidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
}

export default function Sidebar({ isCollapsed, onToggle }: SidebarProps) {
  const { user } = useUser();
  const [activeTab, setActiveTab] = useState('overview');
  const pathname = usePathname();

  const navigationItems = [
    { id: 'overview', label: 'Overview', icon: Home, href: '/' },
    { id: 'leads', label: 'Leads', icon: Users, href: '/leads' },
    { id: 'activity', label: 'Activity Logs', icon: Activity },
    { id: 'usage', label: 'Usage', icon: BarChart3 },
    { id: 'api-keys', label: 'API Keys', icon: Key },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className={`bg-white border-r border-gray-200 flex flex-col h-screen transition-all duration-300 ${
      isCollapsed ? 'w-16' : 'w-64'
    }`}>
      {/* Logo */}
      <div className="p-4 border-b border-gray-200 h-16 flex items-center">
        <div className="flex items-center">
          <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center mr-3">
            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" clipRule="evenodd" />
            </svg>
          </div>
          {!isCollapsed && (
            <h1 className="text-xl font-bold text-gray-900">Tuco AI</h1>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 icon-24" />
          <input
            type="text"
            placeholder={isCollapsed ? '' : 'Search'}
            className="w-full pl-12 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-body-small"
          />
          {!isCollapsed && (
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 text-xs">
              ⌘K
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4">
        <ul className="space-y-1">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.href ? pathname === item.href : activeTab === item.id;

            const baseClasses = `w-full flex items-center ${isCollapsed ? 'justify-center px-2' : 'px-3'} py-2 rounded-lg text-body-small font-body-small transition-colors cursor-pointer ${
              isActive ? 'bg-primary-light text-primary' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`;

            const iconClasses = `icon-24 ${isCollapsed ? '' : 'mr-3'} ${isActive ? 'text-primary' : 'text-gray-400'}`;

            return (
              <li key={item.id}>
                {item.href ? (
                  <Link href={item.href} className={baseClasses}>
                    <Icon className={iconClasses} />
                    {!isCollapsed && item.label}
                  </Link>
                ) : (
                  <button
                    onClick={() => setActiveTab(item.id)}
                    className={baseClasses}
                  >
                    <Icon className={iconClasses} />
                    {!isCollapsed && item.label}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      {/* What's New Button */}
      <div className="p-4">
        <button className={`w-full flex items-center ${isCollapsed ? 'justify-center px-2' : 'px-3'} py-2 border border-primary text-primary rounded-lg text-body-small font-body-small bg-primary-light transition-colors cursor-pointer`}>
          <Megaphone className={`icon-24 ${isCollapsed ? '' : 'mr-3'}`} />
          {!isCollapsed && (
            <>
            <div className='flex flex-col items-start'> 
              <span className='font-bold'>What&apos;s New</span>
              <div className="ml-auto text-body-small text-gray-500">
                View our latest update.
              </div>
              </div>
            </>
          )}
        </button>
      </div>

      {/* Account Info */}
      <div className="p-4 border-t border-gray-200">
        <div className={`flex items-center ${isCollapsed ? 'justify-center' : ''}`}>
          <div className={`w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center ${isCollapsed ? '' : 'mr-3'}`}>
            <span className="text-body-small font-body-small text-gray-700">
              {user?.firstName?.charAt(0) || user?.emailAddresses[0]?.emailAddress.charAt(0).toUpperCase()}
            </span>
          </div>
          {!isCollapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-body-small font-body-small text-gray-900 truncate">
                {user?.emailAddresses[0]?.emailAddress}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Collapse Button */}
      <div className="p-4 border-t border-gray-200">
        <button
          onClick={onToggle}
          className={`w-full flex items-center ${isCollapsed ? 'justify-center px-2' : 'justify-center px-3'} py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-body-small font-body-small transition-colors cursor-pointer`}
        >
          {isCollapsed ? (
            <ChevronRight className="icon-24" />
          ) : (
            <>
              <ChevronLeft className="icon-24 mr-2" />
              Collapse
            </>
          )}
        </button>
      </div>
    </div>
  );
}
