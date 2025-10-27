'use client';

import { useState, useEffect } from 'react';
import { useUser, useOrganization } from '@clerk/nextjs';
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
  ChevronLeft,
  ChevronRight,
  Smartphone,
  Send,
  MessageSquare
} from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';

interface SidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
}

interface Line {
  _id: string;
  phone: string;
  isActive: boolean;
  provisioningStatus: 'provisioning' | 'active' | 'failed';
  healthCheck?: {
    lastCheckedAt?: string;
    status?: 'healthy' | 'down';
    lastEmailSentAt?: string;
    lastHealthyAt?: string;
    consecutiveFailures?: number;
  };
}

interface HealthStatus {
  status: 'all-operational' | 'some-down' | 'all-down' | 'unknown';
  healthyCount: number;
  downCount: number;
  totalCount: number;
  hasUserLines: boolean;
}

export default function Sidebar({ isCollapsed, onToggle }: SidebarProps) {
  const router = useRouter();
  const { user } = useUser();
  const { organization } = useOrganization();
  const [activeTab, setActiveTab] = useState('overview');
  const pathname = usePathname();
  const [healthStatus, setHealthStatus] = useState<HealthStatus | null>(null);

  // Fetch health status from database (cron job data)
  useEffect(() => {
    const fetchHealthStatus = async () => {
      try {
        const linesRes = await fetch('/api/lines');
        if (linesRes.ok) {
          const linesData = await linesRes.json();
          const lines = linesData.lines || [];
          
          // Filter active user lines only
          const activeUserLines = lines.filter((l: Line) => 
            l.isActive && 
            l.provisioningStatus === 'active' && 
            l.phone !== 'AVAILABILITY-CHECK'
          );
          
          const linesWithHealthData = activeUserLines.filter((l: Line) => l.healthCheck?.status);
          
          const healthyCount = linesWithHealthData.filter((l: Line) => l.healthCheck?.status === 'healthy').length;
          const downCount = linesWithHealthData.filter((l: Line) => l.healthCheck?.status === 'down').length;
          const totalCount = linesWithHealthData.length;
          
          let status: 'all-operational' | 'some-down' | 'all-down' | 'unknown';
          if (totalCount === 0) {
            status = 'unknown'; // No health data yet
          } else if (healthyCount > 0 && downCount === 0) {
            status = 'all-operational'; // All lines operational
          } else if (healthyCount > 0 && downCount > 0) {
            status = 'some-down'; // Some lines down
          } else if (downCount > 0 && healthyCount === 0) {
            status = 'all-down'; // All lines down
          } else {
            status = 'unknown';
          }
          
          setHealthStatus({
            status,
            healthyCount,
            downCount,
            totalCount,
            hasUserLines: activeUserLines.length > 0
          });
        }
      } catch (error) {
        console.error('Failed to fetch health status:', error);
      }
    };

    fetchHealthStatus();
    // Refresh every 5 minutes to match cron job interval
    const interval = setInterval(fetchHealthStatus, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [organization?.id]);

  const navigationItems = [
    { id: 'overview', label: 'Overview', icon: Home, href: '/' },
    { id: 'leads', label: 'Leads', icon: Users, href: '/leads' },
    { id: 'unibox', label: 'Unibox', icon: MessageSquare, href: '/unibox' },
    { id: 'campaigns', label: 'Campaigns', icon: Send, href: '/campaigns' },
    { id: 'lines', label: 'Lines', icon: Smartphone, href: '/lines' },
    { id: 'activity', label: 'Activity Logs', icon: Activity, href: '/activities' },
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
          <div className="w-8 h-8 h-full flex items-center justify-center mr-2">
            <Image src="/images/brand/tuco_v1_round.svg" alt="Tuco AI" width={32} height={32} />
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

      {/* Availability Status */}
      <div className="p-4 cursor-pointer" onClick={() => router.push("/lines")}>
        {!isCollapsed ? (
          <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg p-3.5 border border-gray-200">
            <div className="flex items-center mb-2.5">
              <Activity className="w-4 h-4 text-gray-600 mr-2" />
              <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Status</span>
            </div>
            {healthStatus?.status === 'all-operational' && (
              <div className="flex items-center">
                <div className="w-2 h-2 rounded-full bg-green-500 mr-2 animate-pulse" />
                <span className="text-sm font-medium text-gray-900">All lines operational</span>
              </div>
            )}
            {healthStatus?.status === 'some-down' && (
              <div className="flex items-center">
                <div className="w-2 h-2 rounded-full bg-yellow-500 mr-2 animate-pulse" />
                <span className="text-sm font-medium text-yellow-700">
                  Some lines down ({healthStatus.downCount}/{healthStatus.totalCount})
                </span>
              </div>
            )}
            {healthStatus?.status === 'all-down' && (
              <div className="flex items-center">
                <div className="w-2 h-2 rounded-full bg-red-500 mr-2 animate-pulse" />
                <span className="text-sm font-medium text-red-700">All lines down</span>
              </div>
            )}
            {(!healthStatus || healthStatus.status === 'unknown') && (
              <div className="flex items-center">
                <div className="w-2 h-2 rounded-full bg-gray-400 mr-2" />
                <span className="text-sm font-medium text-gray-600">Checking status...</span>
              </div>
            )}
          </div>
        ) : (
          <div className="flex justify-center">
            <Activity className="w-5 h-5 text-gray-400" />
          </div>
        )}
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
