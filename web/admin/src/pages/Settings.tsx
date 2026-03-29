import { useEffect, useState } from 'react';
import { adminService } from '../services/adminService';

type DocKey = 'privacy' | 'terms' | 'medical' | 'dataDeletion';

const labels: Record<DocKey, string> = {
  privacy: '隐私政策',
  terms: '用户协议',
  medical: '医疗免责声明',
  dataDeletion: '账号注销与数据删除说明',
};

export function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string>('');
  const [form, setForm] = useState<Record<DocKey, string>>({
    privacy: '',
    terms: '',
    medical: '',
    dataDeletion: '',
  });

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        setLoading(true);
        const docs = await adminService.getComplianceDocs();
        if (!mounted) {
          return;
        }
        setForm({
          privacy: docs.privacy || '',
          terms: docs.terms || '',
          medical: docs.medical || '',
          dataDeletion: docs.dataDeletion || '',
        });
        setUpdatedAt(docs.updatedAt || '');
        setError(null);
      } catch (err: any) {
        if (!mounted) {
          return;
        }
        setError(err?.response?.data?.message || err?.message || '加载失败');
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      mounted = false;
    };
  }, []);

  const handleChange = (key: DocKey, value: string) => {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const docs = await adminService.updateComplianceDocs(form);
      setForm({
        privacy: docs.privacy || '',
        terms: docs.terms || '',
        medical: docs.medical || '',
        dataDeletion: docs.dataDeletion || '',
      });
      setUpdatedAt(docs.updatedAt || '');
      setError(null);
      window.alert('保存成功');
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="text-xl font-bold text-slate-900">系统设置</div>
        <div className="mt-1 text-sm text-slate-500">
          配置登录页和个人中心展示的协议文案。
        </div>
        {updatedAt ? (
          <div className="mt-2 text-xs text-slate-400">
            最近更新：{new Date(updatedAt).toLocaleString('zh-CN')}
          </div>
        ) : null}
      </div>

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">
          加载中...
        </div>
      ) : (
        <>
          {(['privacy', 'terms', 'medical', 'dataDeletion'] as DocKey[]).map((key) => (
            <div key={key} className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="mb-3 text-sm font-bold text-slate-700">{labels[key]}</div>
              <textarea
                value={form[key]}
                onChange={(event) => handleChange(key, event.target.value)}
                rows={8}
                className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-sky-500 focus:outline-none"
              />
            </div>
          ))}

          {error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
              {error}
            </div>
          ) : null}

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <button
              onClick={() => void handleSave()}
              disabled={saving}
              className="rounded-lg bg-sky-600 px-5 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? '保存中...' : '保存配置'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
