import DashboardLayout from '@/components/DashboardLayout';
import { BarChart3, Users, Activity, Key } from 'lucide-react';

export default function Home() {
  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Overview</h1>
          <p className="text-body-small text-gray-600 mt-1">Welcome to your lead management dashboard</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-body-small font-body-small text-gray-600">Total Leads</p>
                <p className="text-2xl font-bold text-gray-900">0</p>
              </div>
              <div className="w-12 h-12 bg-primary-light rounded-lg flex items-center justify-center">
                <Users className="w-6 h-6 text-primary" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-body-small font-body-small text-gray-600">Active Campaigns</p>
                <p className="text-2xl font-bold text-gray-900">0</p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <Activity className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-body-small font-body-small text-gray-600">Conversion Rate</p>
                <p className="text-2xl font-bold text-gray-900">0%</p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <BarChart3 className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-body-small font-body-small text-gray-600">API Calls</p>
                <p className="text-2xl font-bold text-gray-900">0</p>
              </div>
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <Key className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <a
              href="/leads"
              className="p-4 border border-gray-200 rounded-lg hover:border-primary transition-colors cursor-pointer"
            >
              <Users className="w-8 h-8 text-primary mb-3" />
              <h3 className="font-medium text-gray-900 mb-1">Import Leads</h3>
              <p className="text-body-small text-gray-600">Upload CSV files or sync with external platforms</p>
            </a>

            <a
              href="/analytics"
              className="p-4 border border-gray-200 rounded-lg hover:border-primary transition-colors cursor-pointer"
            >
              <BarChart3 className="w-8 h-8 text-primary mb-3" />
              <h3 className="font-medium text-gray-900 mb-1">View Analytics</h3>
              <p className="text-body-small text-gray-600">Track your lead performance and metrics</p>
            </a>

            <a
              href="/api-key"
              className="p-4 border border-gray-200 rounded-lg hover:border-primary transition-colors cursor-pointer"
            >
              <Key className="w-8 h-8 text-primary mb-3" />
              <h3 className="font-medium text-gray-900 mb-1">API Keys</h3>
              <p className="text-body-small text-gray-600">Manage your API keys and integrations</p>
            </a>


          </div>
        </div>
    </div>
    </DashboardLayout>
  );
}
