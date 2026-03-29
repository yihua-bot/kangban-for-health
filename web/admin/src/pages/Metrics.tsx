import { useState } from 'react';
import { TrendingUp, TrendingDown, Activity, Heart, Droplets } from 'lucide-react';

export function MetricsPage() {
  const [timeRange, setTimeRange] = useState<'day' | 'week' | 'month'>('week');

  // 模拟统计数据
  const overviewData = [
    { label: '血压记录总数', value: '2,345', change: '+12%', trend: 'up', icon: Heart, color: 'text-rose-500', bg: 'bg-rose-100' },
    { label: '血糖记录总数', value: '1,892', change: '+8%', trend: 'up', icon: Droplets, color: 'text-amber-500', bg: 'bg-amber-100' },
    { label: '活跃测量用户', value: '892', change: '+15%', trend: 'up', icon: Activity, color: 'text-sky-500', bg: 'bg-sky-100' },
    { label: '异常数据比例', value: '12.3%', change: '-5%', trend: 'down', icon: TrendingDown, color: 'text-emerald-500', bg: 'bg-emerald-100' },
  ];

  // 模拟最近记录
  const recentRecords = [
    { id: 1, user: '王建国', type: '血压', value: '146/92', status: 'high', time: '10分钟前' },
    { id: 2, user: '李秀兰', type: '血糖', value: '7.8 mmol/L', status: 'high', time: '15分钟前' },
    { id: 3, user: '张大明', type: '血压', value: '132/82', status: 'normal', time: '20分钟前' },
    { id: 4, user: '刘桂芬', type: '血糖', value: '5.6 mmol/L', status: 'normal', time: '30分钟前' },
    { id: 5, user: '陈志强', type: '血压', value: '158/98', status: 'high', time: '1小时前' },
    { id: 6, user: '赵玉兰', type: '血糖', value: '6.2 mmol/L', status: 'normal', time: '1小时前' },
  ];

  const getStatusColor = (status: string) => {
    if (status === 'high') return 'text-amber-600 bg-amber-100';
    if (status === 'low') return 'text-sky-600 bg-sky-100';
    return 'text-emerald-600 bg-emerald-100';
  };

  const getStatusText = (status: string) => {
    if (status === 'high') return '偏高';
    if (status === 'low') return '偏低';
    return '正常';
  };

  return (
    <div>
      {/* 页面标题 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">健康数据统计</h1>
          <p className="text-slate-500 mt-1">查看用户的健康指标记录和趋势</p>
        </div>
        <div className="flex gap-2">
          {(['day', 'week', 'month'] as const).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                timeRange === range
                  ? 'bg-sky-500 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
              }`}
            >
              {range === 'day' ? '今日' : range === 'week' ? '本周' : '本月'}
            </button>
          ))}
        </div>
      </div>

      {/* 概览卡片 */}
      <div className="grid grid-cols-4 gap-6 mb-6">
        {overviewData.map((item, index) => (
          <div key={index} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className={`p-3 rounded-xl ${item.bg}`}>
                <item.icon size={24} className={item.color} />
              </div>
              <span className={`flex items-center gap-1 text-sm font-medium ${
                item.trend === 'up' ? 'text-emerald-600' : 'text-rose-600'
              }`}>
                {item.trend === 'up' ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                {item.change}
              </span>
            </div>
            <div className="text-2xl font-bold text-slate-900">{item.value}</div>
            <div className="text-sm text-slate-500 mt-1">{item.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* 最近记录 */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          <div className="p-6 border-b border-slate-200">
            <h2 className="text-lg font-bold text-slate-900">最近记录</h2>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {recentRecords.map((record) => (
                <div key={record.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-50">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      record.type === '血压' ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-600'
                    }`}>
                      {record.type === '血压' ? <Heart size={18} /> : <Droplets size={18} />}
                    </div>
                    <div>
                      <div className="font-medium text-slate-900">{record.user}</div>
                      <div className="text-sm text-slate-500">{record.time}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-slate-900">{record.value}</div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${getStatusColor(record.status)}`}>
                      {getStatusText(record.status)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 异常分析 */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          <div className="p-6 border-b border-slate-200">
            <h2 className="text-lg font-bold text-slate-900">异常数据分布</h2>
          </div>
          <div className="p-6">
            <div className="space-y-6">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-slate-600">血压偏高</span>
                  <span className="text-sm font-bold text-slate-900">35%</span>
                </div>
                <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-rose-500 rounded-full" style={{ width: '35%' }}></div>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-slate-600">血糖偏高</span>
                  <span className="text-sm font-bold text-slate-900">28%</span>
                </div>
                <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-500 rounded-full" style={{ width: '28%' }}></div>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-slate-600">血压偏低</span>
                  <span className="text-sm font-bold text-slate-900">8%</span>
                </div>
                <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-sky-500 rounded-full" style={{ width: '8%' }}></div>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-slate-600">血糖偏低</span>
                  <span className="text-sm font-bold text-slate-900">5%</span>
                </div>
                <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-violet-500 rounded-full" style={{ width: '5%' }}></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
