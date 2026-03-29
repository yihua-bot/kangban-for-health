import adminApi from './api';

export interface DashboardStats {
  totalUsers: number;
  dailyReports: number;
  pendingAbnormalities: number;
  activeUsers: number;
}

export interface RecentActivity {
  type: string;
  user: string;
  action: string;
  timestamp: string;
}

export interface AbnormalAlert {
  id: string;
  userName: string;
  itemName: string;
  riskLevel: 'low' | 'medium' | 'high' | 'urgent';
  createdAt: string;
}

export interface ComplianceDocsConfig {
  privacy: string;
  terms: string;
  medical: string;
  dataDeletion: string;
  updatedAt: string;
}

export const adminService = {
  async getDashboardStats(): Promise<DashboardStats> {
    const response = await adminApi.get('/admin/dashboard/stats');
    return response.data;
  },

  async getRecentActivity(limit: number = 10): Promise<RecentActivity[]> {
    const response = await adminApi.get('/admin/dashboard/recent-activity', {
      params: { limit },
    });
    return response.data;
  },

  async getAbnormalAlerts(): Promise<AbnormalAlert[]> {
    const response = await adminApi.get('/admin/dashboard/abnormal-alerts');
    return response.data;
  },

  async getAllUsers(page: number = 1, limit: number = 20, search?: string) {
    const response = await adminApi.get('/admin/users', {
      params: { page, limit, search },
    });
    return response.data;
  },

  async getAllReports(page: number = 1, limit: number = 20, status?: string) {
    const response = await adminApi.get('/admin/reports', {
      params: { page, limit, status },
    });
    return response.data;
  },

  async getMetricsStats(days: number = 30) {
    const response = await adminApi.get('/admin/metrics/stats', {
      params: { days },
    });
    return response.data;
  },

  async getComplianceDocs(): Promise<ComplianceDocsConfig> {
    const response = await adminApi.get('/admin/compliance-docs');
    return response.data;
  },

  async updateComplianceDocs(payload: {
    privacy?: string;
    terms?: string;
    medical?: string;
    dataDeletion?: string;
  }): Promise<ComplianceDocsConfig> {
    const response = await adminApi.put('/admin/compliance-docs', payload);
    return response.data;
  },
};
