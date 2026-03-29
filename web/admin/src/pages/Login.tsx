import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { authService } from '../services/authService';

interface LoginPageProps {
  onLoginSuccess: () => void;
}

export function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [account, setAccount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await authService.adminLogin(account.trim());
      localStorage.setItem('admin_user', JSON.stringify(response.user));
      onLoginSuccess();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-xl bg-sky-500/20 p-2">
            <ShieldCheck className="text-sky-400" size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">管理后台登录</h1>
            <p className="text-sm text-slate-400">超级管理员免密登录</p>
          </div>
        </div>

        <label className="mb-2 block text-sm text-slate-300">管理员账号</label>
        <input
          value={account}
          onChange={(e) => setAccount(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              void handleLogin();
            }
          }}
          placeholder="输入管理员账号"
          className="mb-4 w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-white outline-none focus:border-sky-500"
        />

        {error && (
          <div className="mb-4 rounded-lg border border-rose-700 bg-rose-900/20 px-3 py-2 text-sm text-rose-300">
            {error}
          </div>
        )}

        <button
          onClick={() => void handleLogin()}
          disabled={loading}
          className="w-full rounded-xl bg-sky-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? '登录中...' : '登录'}
        </button>
      </div>
    </div>
  );
}
