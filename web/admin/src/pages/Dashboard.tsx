import { useEffect, useState } from 'react';
import { Users, FileText, Activity, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react';
import { adminService, RecentActivity, AbnormalAlert } from '../services/adminService';

export function Dashboard() {
  const [stats, setStats] = useState({
    totalUsers: 0,
    dailyReports: 0,
    pendingAbnormalities: 0,
    activeUsers: 0,
  });
  const [recentActivities, setRecentActivities] = useState<RecentActivity[]>([]);
  const [alerts, setAlerts] = useState<AbnormalAlert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const [statsData, activities, alertsData] = await Promise.all([
        adminService.getDashboardStats(),
        adminService.getRecentActivity(5),
        adminService.getAbnormalAlerts(),
      ]);
      setStats(statsData);
      setRecentActivities(activities);
      setAlerts(alertsData);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const statsCards = [
    { label: '总用户数', value: stats.totalUsers, change: '+12%', trend: 'up', icon: Users, color: 'bg-sky-500' },
    { label: '今日新增报告', value: stats.dailyReports, change: '+8%', trend: 'up', icon: FileText, color: 'bg-emerald-500' },
    { label: '待处理异常', value: stats.pendingAbnormalities, change: '-5%', trend: 'down', icon: AlertTriangle, color: 'bg-amber-500' },
    { label: '活跃用户', value: stats.activeUsers, change: '+15%', trend: 'up', icon: Activity, color: 'bg-violet-500' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-slate-500">加载中...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">仪表盘</h1>
        <p className="text-slate-500 mt-1">系统运行状况概览</p>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-4 gap-6">
        {statsCards.map((stat, index) => (
          <div key={index} className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">{stat.label}</p>
                <p className="text-3xl font-bold text-slate-900 mt-2">{stat.value}</p>
                <div className="flex items-center gap-1 mt-2">
                  {stat.trend === 'up' ? (
                    <TrendingUp size={16} className="text-emerald-500" />
                  ) : (
                    <TrendingDown size={16} className="text-rose-500" />
                  )}
                  <span className={stat.trend === 'up' ? 'text-emerald-600 text-sm font-medium' : 'text-rose-600 text-sm font-medium'}>
                    {stat.change}
                  </span>
                  <span className="text-slate-400 text-sm">vs 上周</span>
                </div>
              </div>
              <div className={`${stat.color} p-3 rounded-xl`}>
                <stat.icon size={24} className="text-white" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* 最近活动 */}
        <div className="col-span-2 bg-white rounded-xl shadow-sm border border-slate-200">
          <div className="p-6 border-b border-slate-200">
            <h2 className="text-lg font-bold text-slate-900">最近活动</h2>
          </div>
          <div className="p-6">
            {recentActivities.length === 0 ? (
              <div className="text-center text-slate-400 py-8">暂无活动记录</div>
            ) : (
              <div className="space-y-4">
                {recentActivities.map((activity, index) => (
                  <div key={index} className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-lg">
                      {activity.user?.charAt(0) || '?'}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-slate-900">{activity.user}</div>
                      <div className="text-sm text-slate-500">{activity.action}</div>
                    </div>
                    <div className="text-sm text-slate-400">
                      {new Date(activity.timestamp).toLocaleString('zh-CN')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 异常提醒 */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          <div className="p-6 border-b border-slate-200">
            <h2 className="text-lg font-bold text-slate-900">异常提醒</h2>
          </div>
          <div className="p-6">
            {alerts.length === 0 ? (
              <div className="text-center text-slate-400 py-8">暂无异常</div>
            ) : (
              <div className="space-y-4">
                {alerts.slice(0, 4).map((alert, index) => (
                  <div key={index} className="p-3 rounded-lg bg-slate-50">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-slate-900">{alert.userName}</span>
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        alert.riskLevel === 'high' || alert.riskLevel === 'urgent' ? 'bg-rose-100 text-rose-700' :
                        alert.riskLevel === 'medium' ? 'bg-amber-100 text-amber-700' :
                        'bg-sky-100 text-sky-700'
                      }`}>
                        {alert.riskLevel === 'urgent' ? '紧急' : alert.riskLevel === 'high' ? '高' : alert.riskLevel === 'medium' ? '中等' : '一般'}
                      </span>
                    </div>
                    <div className="text-sm text-slate-600">{alert.itemName}</div>
                    <div className="text-xs text-slate-400 mt-1">
                      {new Date(alert.createdAt).toLocaleString('zh-CN')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
