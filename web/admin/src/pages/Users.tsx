import { useState } from 'react';
import { Search, Filter, MoreVertical, UserPlus, Phone, Mail } from 'lucide-react';

export function UsersPage() {
  const [searchTerm, setSearchTerm] = useState('');

  // 模拟用户数据
  const users = [
    { id: 1, name: '王建国', age: 67, phone: '138****1234', healthTags: ['高血压', '血糖偏高'], familyCount: 2, lastActive: '刚刚', status: 'active' },
    { id: 2, name: '李秀兰', age: 65, phone: '139****5678', healthTags: ['糖尿病'], familyCount: 3, lastActive: '1小时前', status: 'active' },
    { id: 3, name: '张大明', age: 72, phone: '137****9012', healthTags: ['高血压', '高血脂'], familyCount: 1, lastActive: '昨天', status: 'inactive' },
    { id: 4, name: '刘桂芬', age: 68, phone: '136****3456', healthTags: ['骨质疏松'], familyCount: 2, lastActive: '3天前', status: 'active' },
    { id: 5, name: '陈志强', age: 70, phone: '135****7890', healthTags: ['脂肪肝'], familyCount: 1, lastActive: '1周前', status: 'inactive' },
    { id: 6, name: '赵玉兰', age: 66, phone: '134****2345', healthTags: ['甲状腺结节'], familyCount: 4, lastActive: '刚刚', status: 'active' },
  ];

  const filteredUsers = users.filter(user => 
    user.name.includes(searchTerm) || user.phone.includes(searchTerm)
  );

  return (
    <div>
      {/* 页面标题 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">用户管理</h1>
          <p className="text-slate-500 mt-1">管理所有注册用户信息</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 transition-colors">
          <UserPlus size={20} />
          添加用户
        </button>
      </div>

      {/* 搜索和筛选 */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
        <div className="flex gap-4">
          <div className="relative flex-1">
            <Search size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="搜索用户姓名或手机号..."
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

      {/* 用户列表 */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-6 py-4 text-sm font-semibold text-slate-600">用户信息</th>
              <th className="text-left px-6 py-4 text-sm font-semibold text-slate-600">健康标签</th>
              <th className="text-left px-6 py-4 text-sm font-semibold text-slate-600">家属数量</th>
              <th className="text-left px-6 py-4 text-sm font-semibold text-slate-600">最后活跃</th>
              <th className="text-left px-6 py-4 text-sm font-semibold text-slate-600">状态</th>
              <th className="text-right px-6 py-4 text-sm font-semibold text-slate-600">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {filteredUsers.map((user) => (
              <tr key={user.id} className="hover:bg-slate-50">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-sky-100 rounded-full flex items-center justify-center text-sky-600 font-bold">
                      {user.name[0]}
                    </div>
                    <div>
                      <div className="font-medium text-slate-900">{user.name}</div>
                      <div className="text-sm text-slate-500">{user.age}岁 · {user.phone}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-wrap gap-1">
                    {user.healthTags.map((tag, index) => (
                      <span key={index} className="px-2 py-1 text-xs bg-amber-100 text-amber-700 rounded-full">
                        {tag}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className="text-slate-900">{user.familyCount} 人</span>
                </td>
                <td className="px-6 py-4">
                  <span className="text-slate-600">{user.lastActive}</span>
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    user.status === 'active' 
                      ? 'bg-emerald-100 text-emerald-700' 
                      : 'bg-slate-100 text-slate-600'
                  }`}>
                    {user.status === 'active' ? '活跃' : '不活跃'}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button className="p-2 hover:bg-slate-100 rounded-lg">
                      <Phone size={18} className="text-slate-500" />
                    </button>
                    <button className="p-2 hover:bg-slate-100 rounded-lg">
                      <Mail size={18} className="text-slate-500" />
                    </button>
                    <button className="p-2 hover:bg-slate-100 rounded-lg">
                      <MoreVertical size={18} className="text-slate-500" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* 分页 */}
        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between">
          <div className="text-sm text-slate-500">
            共 {filteredUsers.length} 条记录
          </div>
          <div className="flex gap-2">
            <button className="px-3 py-1 border border-slate-200 rounded hover:bg-slate-50">上一页</button>
            <button className="px-3 py-1 bg-sky-500 text-white rounded">1</button>
            <button className="px-3 py-1 border border-slate-200 rounded hover:bg-slate-50">2</button>
            <button className="px-3 py-1 border border-slate-200 rounded hover:bg-slate-50">下一页</button>
          </div>
        </div>
      </div>
    </div>
  );
}
