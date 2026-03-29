import adminApi from './api';

interface AdminLoginResponse {
  user: {
    id: string;
    phone: string;
    name: string;
    role: string;
    account: string;
  };
}

export const authService = {
  async adminLogin(account: string): Promise<AdminLoginResponse> {
    const response = await adminApi.post<AdminLoginResponse>('/auth/admin-login', {
      account,
    });
    return response.data;
  },

  async logout(): Promise<void> {
    await adminApi.post('/auth/logout');
  },
};
