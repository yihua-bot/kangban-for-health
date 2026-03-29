import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, HttpException, HttpStatus } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import * as bcrypt from 'bcryptjs';
import { createHmac } from 'crypto';
import { AuthService } from './auth.service';
import { AuthEmailService } from './auth-email.service';
import { User } from '../users/entities/user.entity';

const mockUser: Partial<User> = {
  id: 'user-uuid-1',
  phone: '13800138000',
  email: 'demo@example.com',
  name: '测试用户',
  password: '',
  healthTags: [],
};

const mockUserRepo = {
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
};

const mockJwtService = {
  sign: jest.fn().mockReturnValue('mock-jwt-token'),
};

const mockCacheManager = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
};

const mockAuthEmailService = {
  sendLoginCodeEmail: jest.fn(),
};

function hashVerificationCode(subject: string, code: string) {
  const secret = process.env.JWT_SECRET || 'test-jwt-secret-for-unit-tests-only';
  return createHmac('sha256', secret)
    .update(`${subject}:${code}`)
    .digest('hex');
}

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();

    if (!process.env.JWT_SECRET) {
      process.env.JWT_SECRET = 'test-jwt-secret-for-unit-tests-only';
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: JwtService, useValue: mockJwtService },
        { provide: CACHE_MANAGER, useValue: mockCacheManager },
        { provide: AuthEmailService, useValue: mockAuthEmailService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('register', () => {
    it('throws UnauthorizedException if phone already exists', async () => {
      mockUserRepo.findOne.mockResolvedValue(mockUser);
      await expect(
        service.register({ phone: '13800138000', password: 'pass123', name: '用户' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('hashes password before saving', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);
      const savedUser = { ...mockUser, password: 'hashed' };
      mockUserRepo.create.mockReturnValue(savedUser);
      mockUserRepo.save.mockResolvedValue(savedUser);

      await service.register({ phone: '13900139000', password: 'plaintext', name: '新用户' });

      const createCall = mockUserRepo.create.mock.calls[0][0];
      expect(createCall.password).not.toBe('plaintext');
      expect(await bcrypt.compare('plaintext', createCall.password)).toBe(true);
    });

    it('returns access_token and user on success', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);
      const savedUser = { ...mockUser, password: 'hashed' };
      mockUserRepo.create.mockReturnValue(savedUser);
      mockUserRepo.save.mockResolvedValue(savedUser);

      const result = await service.register({ phone: '13900139000', password: 'pass', name: '用户' });
      expect(result).toHaveProperty('access_token', 'mock-jwt-token');
      expect(result).toHaveProperty('user');
    });
  });

  describe('login', () => {
    it('throws UnauthorizedException for unknown phone', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);
      await expect(
        service.login({ account: '00000000000', password: 'pass' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for wrong password', async () => {
      const hashed = await bcrypt.hash('correct', 10);
      mockUserRepo.findOne.mockResolvedValue({ ...mockUser, password: hashed });
      await expect(
        service.login({ account: '13800138000', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('returns token on valid credentials', async () => {
      const hashed = await bcrypt.hash('correct', 10);
      mockUserRepo.findOne.mockResolvedValue({ ...mockUser, password: hashed });

      const result = await service.login({ account: '13800138000', password: 'correct' });
      expect(result).toHaveProperty('access_token', 'mock-jwt-token');
    });
  });

  describe('sendLoginCode', () => {
    it('throws TOO_MANY_REQUESTS if called within resend interval', async () => {
      mockCacheManager.get.mockResolvedValue({
        codeHash: hashVerificationCode('13800138000', '123456'),
        sentAt: Date.now(),
      });
      await expect(
        service.sendLoginCode({ phone: '13800138000' }),
      ).rejects.toThrow(HttpException);

      try {
        await service.sendLoginCode({ phone: '13800138000' });
      } catch (e: any) {
        expect(e.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      }
    });

    it('stores code in cache and returns expireInSeconds', async () => {
      mockCacheManager.get.mockResolvedValue(null);
      mockCacheManager.set.mockResolvedValue(undefined);

      const result = await service.sendLoginCode({ phone: '13800138000' });
      expect(mockCacheManager.set).toHaveBeenCalledWith(
        'login_code:13800138000',
        expect.objectContaining({ codeHash: expect.any(String) }),
        expect.any(Number),
      );
      expect(result.expireInSeconds).toBe(300);
      expect(result.resendAfterSeconds).toBe(60);
    });
  });

  describe('loginWithCode', () => {
    it('accepts universal code when LOGIN_UNIVERSAL_CODE is set', async () => {
      const originalCode = process.env.LOGIN_UNIVERSAL_CODE;
      process.env.LOGIN_UNIVERSAL_CODE = '8888';

      // Re-create service so it picks up the env var
      const module = await Test.createTestingModule({
        providers: [
          AuthService,
          { provide: getRepositoryToken(User), useValue: mockUserRepo },
          { provide: JwtService, useValue: mockJwtService },
          { provide: CACHE_MANAGER, useValue: mockCacheManager },
          { provide: AuthEmailService, useValue: mockAuthEmailService },
        ],
      }).compile();
      const svc = module.get<AuthService>(AuthService);

      mockUserRepo.findOne.mockResolvedValue(mockUser);

      const result = await svc.loginWithCode({ phone: '13800138000', code: '8888' });
      expect(result).toHaveProperty('access_token');

      process.env.LOGIN_UNIVERSAL_CODE = originalCode;
    });

    it('throws UnauthorizedException for wrong code', async () => {
      mockCacheManager.get.mockResolvedValue({
        codeHash: hashVerificationCode('13800138000', '111111'),
        sentAt: Date.now(),
      });
      await expect(
        service.loginWithCode({ phone: '13800138000', code: '999999' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('deletes code from cache after successful use', async () => {
      mockCacheManager.get.mockResolvedValue({
        codeHash: hashVerificationCode('13800138000', '123456'),
        sentAt: Date.now(),
      });
      mockCacheManager.del.mockResolvedValue(undefined);
      mockUserRepo.findOne.mockResolvedValue(mockUser);

      await service.loginWithCode({ phone: '13800138000', code: '123456' });
      expect(mockCacheManager.del).toHaveBeenCalledWith('login_code:13800138000');
    });
  });

  describe('adminLogin', () => {
    beforeEach(() => {
      process.env.SUPER_ADMIN_ACCOUNT = 'admin-test-account';
      process.env.SUPER_ADMIN_PASSWORD = 'admin-test-password';
    });

    afterEach(() => {
      const originalAccount = process.env.SUPER_ADMIN_ACCOUNT;
      const originalPassword = process.env.SUPER_ADMIN_PASSWORD;
      process.env.SUPER_ADMIN_ACCOUNT = originalAccount;
      process.env.SUPER_ADMIN_PASSWORD = originalPassword;
    });

    it('throws UnauthorizedException when SUPER_ADMIN_ACCOUNT is not set', async () => {
      const originalAccount = process.env.SUPER_ADMIN_ACCOUNT;
      const originalPassword = process.env.SUPER_ADMIN_PASSWORD;
      delete process.env.SUPER_ADMIN_ACCOUNT;
      delete process.env.SUPER_ADMIN_PASSWORD;
      await expect(
        service.adminLogin({ account: 'anything', password: 'anything' }),
      ).rejects.toThrow(UnauthorizedException);
      process.env.SUPER_ADMIN_ACCOUNT = originalAccount;
      process.env.SUPER_ADMIN_PASSWORD = originalPassword;
    });

    it('throws UnauthorizedException for wrong account', async () => {
      await expect(
        service.adminLogin({ account: 'wrong-account', password: 'admin-test-password' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for wrong password', async () => {
      await expect(
        service.adminLogin({ account: 'admin-test-account', password: 'wrong-password' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('returns super_admin token for correct account and password', async () => {
      const result = await service.adminLogin({ account: 'admin-test-account', password: 'admin-test-password' });
      expect(result).toHaveProperty('access_token', 'mock-jwt-token');
      expect(result.user.role).toBe('super_admin');
    });
  });

  describe('sendEmailLoginCode', () => {
    it('stores email code in cache and sends email', async () => {
      mockCacheManager.get.mockResolvedValue(null);
      mockCacheManager.set.mockResolvedValue(undefined);
      mockAuthEmailService.sendLoginCodeEmail.mockResolvedValue(undefined);

      const result = await service.sendEmailLoginCode({
        email: 'demo@example.com',
      });
      expect(mockCacheManager.set).toHaveBeenCalledWith(
        'email_login_code:demo@example.com',
        expect.objectContaining({ codeHash: expect.any(String) }),
        expect.any(Number),
      );
      expect(mockAuthEmailService.sendLoginCodeEmail).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'demo@example.com' }),
      );
      expect(result.expireInSeconds).toBe(300);
      expect(result.resendAfterSeconds).toBe(60);
    });
  });

  describe('loginWithEmailCode', () => {
    it('throws UnauthorizedException for wrong email code', async () => {
      mockCacheManager.get.mockResolvedValue({
        codeHash: hashVerificationCode('demo@example.com', '111111'),
        sentAt: Date.now(),
      });
      await expect(
        service.loginWithEmailCode({ email: 'demo@example.com', code: '999999' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('returns token when email code is valid', async () => {
      mockCacheManager.get.mockResolvedValue({
        codeHash: hashVerificationCode('demo@example.com', '123456'),
        sentAt: Date.now(),
      });
      mockCacheManager.del.mockResolvedValue(undefined);
      mockUserRepo.findOne.mockResolvedValue(mockUser);

      const result = await service.loginWithEmailCode({
        email: 'demo@example.com',
        code: '123456',
      });
      expect(result).toHaveProperty('access_token', 'mock-jwt-token');
      expect(mockCacheManager.del).toHaveBeenCalledWith(
        'email_login_code:demo@example.com',
      );
    });

    it('creates user when email code is valid but user does not exist', async () => {
      const newUser = {
        ...mockUser,
        id: 'new-user-id',
        phone: '9abcdef1234',
        email: 'new@example.com',
      };
      mockCacheManager.get.mockResolvedValue({
        codeHash: hashVerificationCode('new@example.com', '123456'),
        sentAt: Date.now(),
      });
      mockCacheManager.del.mockResolvedValue(undefined);
      mockUserRepo.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(newUser);
      mockUserRepo.create.mockReturnValue(newUser);
      mockUserRepo.save.mockRejectedValueOnce(new Error('duplicate key'));

      const result = await service.loginWithEmailCode({
        email: 'new@example.com',
        code: '123456',
      });
      expect(result).toHaveProperty('access_token', 'mock-jwt-token');
      expect(mockUserRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'new@example.com',
          phone: expect.stringMatching(/^9[0-9a-f]{10}$/),
        }),
      );
    });
  });
});
