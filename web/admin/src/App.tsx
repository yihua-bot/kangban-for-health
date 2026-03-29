import { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Users,
  FileText,
  Activity,
  Settings,
  Menu,
  X,
  Bell,
  Search,
  LogOut,
} from 'lucide-react';
import { Dashboard } from './pages/Dashboard';
import { UsersPage } from './pages/Users';
import { ReportsPage } from './pages/Reports';
import { MetricsPage } from './pages/Metrics';
import { SettingsPage } from './pages/Settings';
import { LoginPage } from './pages/Login';
import { authService } from './services/authService';

type PageType = 'dashboard' | 'users' | 'reports' | 'metrics' | 'settings';

export default function App() {
  const [currentPage, setCurrentPage] = useState<PageType>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    // 通过 localStorage 中的用户信息判断是否已登录（token 在 httpOnly cookie 中）
    const user = localStorage.getItem('admin_user');
    setIsAuthenticated(Boolean(user));
  }, []);

  const handleLogout = async () => {
    try {
      await authService.logout();
    } catch {
      // 即使请求失败也清除本地状态
    }
    localStorage.removeItem('admin_user');
    setIsAuthenticated(false);
  };

  if (!isAuthenticated) {
    return <LoginPage onLoginSuccess={() => setIsAuthenticated(true)} />;
  }

  const menuItems = [
    { id: 'dashboard' as PageType, icon: LayoutDashboard, label: '仪表盘' },
    { id: 'users' as PageType, icon: Users, label: '用户管理' },
    { id: 'reports' as PageType, icon: FileText, label: '体检报告' },
    { id: 'metrics' as PageType, icon: Activity, label: '健康数据' },
    { id: 'settings' as PageType, icon: Settings, label: '系统设置' },
  ];

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard />;
      case 'users':
        return <UsersPage />;
      case 'reports':
        return <ReportsPage />;
      case 'metrics':
        return <MetricsPage />;
      case 'settings':
        return <SettingsPage />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex">
      {/* 侧边栏 */}
      <aside className={`${sidebarOpen ? 'w-64' : 'w-20'} bg-slate-900 text-white transition-all duration-300 flex flex-col`}>
        {/* Logo */}
        <div className="p-4 flex items-center justify-between border-b border-slate-700">
          {sidebarOpen && <h1 className="text-xl font-bold">健康管家后台</h1>}
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 hover:bg-slate-800 rounded-lg">
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        {/* 菜单 */}
        <nav className="flex-1 p-4">
          <ul className="space-y-2">
            {menuItems.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => setCurrentPage(item.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    currentPage === item.id 
                      ? 'bg-sky-600 text-white' 
                      : 'hover:bg-slate-800 text-slate-300'
                  }`}
                >
                  <item.icon size={20} />
                  {sidebarOpen && <span>{item.label}</span>}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* 底部 */}
        <div className="p-4 border-t border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-sky-500 rounded-full flex items-center justify-center">
              管
            </div>
            {sidebarOpen && (
              <div>
                <div className="font-medium">管理员</div>
                <div className="text-sm text-slate-400">admin@health.com</div>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* 主内容区 */}
      <main className="flex-1 flex flex-col">
        {/* 顶部导航 */}
        <header className="bg-white border-b border-slate-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="relative">
                <Search size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="搜索用户、报告..." 
                  className="pl-10 pr-4 py-2 w-80 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <button className="relative p-2 hover:bg-slate-100 rounded-lg">
                <Bell size={20} className="text-slate-600" />
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
              </button>
              <button
                onClick={() => void handleLogout()}
                className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
              >
                <LogOut size={16} />
                退出
              </button>
              <div className="text-sm text-slate-600">
                {new Date().toLocaleDateString('zh-CN', { 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric',
                  weekday: 'long'
                })}
              </div>
            </div>
          </div>
        </header>

        {/* 页面内容 */}
        <div className="flex-1 p-6 overflow-auto">
          {renderPage()}
        </div>
      </main>
    </div>
  );
}
