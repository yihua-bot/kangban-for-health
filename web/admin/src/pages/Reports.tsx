import { useState } from 'react';
import { Search, Filter, Eye, Download, FileText } from 'lucide-react';

export function ReportsPage() {
  const [searchTerm, setSearchTerm] = useState('');

  // 模拟报告数据
  const reports = [
    { id: 1, user: '王建国', date: '2024-03-10', hospital: '北京协和医院', type: '年度体检', status: 'analyzed', abnormalCount: 3 },
    { id: 2, user: '李秀兰', date: '2024-03-09', hospital: '北京协和医院', type: '专科检查', status: 'analyzed', abnormalCount: 1 },
    { id: 3, user: '张大明', date: '2024-03-08', hospital: '北京协和医院', type: '复查', status: 'pending', abnormalCount: 0 },
    { id: 4, user: '刘桂芬', date: '2024-03-07', hospital: '北京协和医院', type: '年度体检', status: 'analyzed', abnormalCount: 2 },
    { id: 5, user: '陈志强', date: '2024-03-06', hospital: '北京协和医院', type: '年度体检', status: 'analyzed', abnormalCount: 4 },
  ];

  const getStatusBadge = (status: string) => {
    if (status === 'analyzed') return 'bg-emerald-100 text-emerald-700';
    if (status === 'pending') return 'bg-amber-100 text-amber-700';
    return 'bg-slate-100 text-slate-600';
  };

  const getStatusText = (status: string) => {
    if (status === 'analyzed') return '已分析';
    if (status === 'pending') return '待分析';
    return '未知';
  };

  return (
    <div>
      {/* 页面标题 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">体检报告</h1>
          <p className="text-slate-500 mt-1">管理用户上传的体检报告</p>
        </div>
      </div>

      {/* 搜索和筛选 */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
        <div className="flex gap-4">
          <div className="relative flex-1">
            <Search size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="搜索报告..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>
          <button className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg hover:bg-slate-50">
            <Filter size={20} />
            筛选
          </button>
        </div>
      </div>

      {/* 报告列表 */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-6 py-4 text-sm font-semibold text-slate-600">报告信息</th>
              <th className="text-left px-6 py-4 text-sm font-semibold text-slate-600">用户</th>
              <th className="text-left px-6 py-4 text-sm font-semibold text-slate-600">类型</th>
              <th className="text-left px-6 py-4 text-sm font-semibold text-slate-600">异常项</th>
              <th className="text-left px-6 py-4 text-sm font-semibold text-slate-600">状态</th>
              <th className="text-right px-6 py-4 text-sm font-semibold text-slate-600">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {reports.map((report) => (
              <tr key={report.id} className="hover:bg-slate-50">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-sky-100 rounded-lg flex items-center justify-center">
                      <FileText size={20} className="text-sky-600" />
                    </div>
                    <div>
                      <div className="font-medium text-slate-900">{report.hospital}</div>
                      <div className="text-sm text-slate-500">{report.date}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className="text-slate-900">{report.user}</span>
                </td>
                <td className="px-6 py-4">
                  <span className="text-slate-600">{report.type}</span>
                </td>
                <td className="px-6 py-4">
                  <span className={`font-medium ${report.abnormalCount > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {report.abnormalCount} 项
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 text-xs rounded-full ${getStatusBadge(report.status)}`}>
                    {getStatusText(report.status)}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button className="p-2 hover:bg-slate-100 rounded-lg">
                      <Eye size={18} className="text-slate-500" />
                    </button>
                    <button className="p-2 hover:bg-slate-100 rounded-lg">
                      <Download size={18} className="text-slate-500" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
