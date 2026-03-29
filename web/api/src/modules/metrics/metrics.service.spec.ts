import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { MetricsService } from './metrics.service';
import { HealthMetric } from './entities/metric.entity';
import { HealthTask } from '../tasks/entities/task.entity';
import { Recheck } from '../rechecks/entities/recheck.entity';
import { FamilyService } from '../family/family.service';

const mockMetric: Partial<HealthMetric> = {
  id: 'metric-uuid-1',
  userId: 'user-uuid-1',
  type: 'blood_pressure',
};

const makeQb = () => ({
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  getMany: jest.fn().mockResolvedValue([]),
});

const mockMetricRepo = {
  create: jest.fn(),
  save: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
  createQueryBuilder: jest.fn().mockImplementation(() => makeQb()),
};

const mockTaskRepo = {
  find: jest.fn().mockResolvedValue([]),
  save: jest.fn(),
  create: jest.fn(),
  createQueryBuilder: jest.fn().mockImplementation(() => makeQb()),
};

const mockRecheckRepo = {
  find: jest.fn().mockResolvedValue([]),
  save: jest.fn(),
  create: jest.fn(),
  createQueryBuilder: jest.fn().mockImplementation(() => makeQb()),
};

const mockFamilyService = {
  createHealthEventRecords: jest.fn().mockResolvedValue(0),
};

describe('MetricsService', () => {
  let service: MetricsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Re-setup default return values after clearAllMocks
    mockMetricRepo.createQueryBuilder.mockImplementation(() => makeQb());
    mockMetricRepo.find.mockResolvedValue([]);
    mockTaskRepo.find.mockResolvedValue([]);
    mockTaskRepo.createQueryBuilder.mockImplementation(() => makeQb());
    mockRecheckRepo.find.mockResolvedValue([]);
    mockRecheckRepo.createQueryBuilder.mockImplementation(() => makeQb());
    mockFamilyService.createHealthEventRecords.mockResolvedValue(0);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MetricsService,
        { provide: getRepositoryToken(HealthMetric), useValue: mockMetricRepo },
        { provide: getRepositoryToken(HealthTask), useValue: mockTaskRepo },
        { provide: getRepositoryToken(Recheck), useValue: mockRecheckRepo },
        { provide: FamilyService, useValue: mockFamilyService },
      ],
    }).compile();

    service = module.get<MetricsService>(MetricsService);
  });

  describe('recordBloodPressure', () => {
    const baseDto = { systolic: 120, diastolic: 80 };

    beforeEach(() => {
      mockMetricRepo.create.mockReturnValue({ ...mockMetric });
      mockMetricRepo.save.mockResolvedValue({ ...mockMetric, ...baseDto });
    });

    it('saves metric to repository', async () => {
      await service.recordBloodPressure('user-uuid-1', baseDto);
      expect(mockMetricRepo.save).toHaveBeenCalled();
    });

    it('sets alertTriggered=false for normal readings (120/80)', async () => {
      const result = await service.recordBloodPressure('user-uuid-1', { systolic: 120, diastolic: 80 });
      expect(result.alertTriggered).toBe(false);
    });

    it('sets alertTriggered=true when systolic >= 140', async () => {
      mockMetricRepo.save.mockResolvedValue({ ...mockMetric, systolic: 140, diastolic: 80 });
      const result = await service.recordBloodPressure('user-uuid-1', { systolic: 140, diastolic: 80 });
      expect(result.alertTriggered).toBe(true);
    });

    it('sets alertTriggered=true when diastolic >= 90', async () => {
      mockMetricRepo.save.mockResolvedValue({ ...mockMetric, systolic: 130, diastolic: 90 });
      const result = await service.recordBloodPressure('user-uuid-1', { systolic: 130, diastolic: 90 });
      expect(result.alertTriggered).toBe(true);
    });

    it('does not call familyService for normal readings', async () => {
      await service.recordBloodPressure('user-uuid-1', { systolic: 120, diastolic: 80 });
      expect(mockFamilyService.createHealthEventRecords).not.toHaveBeenCalled();
    });

    it('calls familyService when alert is triggered', async () => {
      mockMetricRepo.save.mockResolvedValue({ ...mockMetric, systolic: 150, diastolic: 95 });
      await service.recordBloodPressure('user-uuid-1', { systolic: 150, diastolic: 95 });
      expect(mockFamilyService.createHealthEventRecords).toHaveBeenCalled();
    });
  });

  describe('recordBloodSugar', () => {
    beforeEach(() => {
      mockMetricRepo.create.mockReturnValue({ ...mockMetric, type: 'blood_sugar' });
      mockMetricRepo.save.mockResolvedValue({ ...mockMetric, type: 'blood_sugar' });
    });

    it('sets alertTriggered=false for normal glucose (5.5 mmol/L)', async () => {
      const result = await service.recordBloodSugar('user-uuid-1', { value: 5.5, timing: 'fasting' });
      expect(result.alertTriggered).toBe(false);
    });

    it('sets alertTriggered=true for high glucose (>= 7.0 mmol/L)', async () => {
      const result = await service.recordBloodSugar('user-uuid-1', { value: 7.0, timing: 'fasting' });
      expect(result.alertTriggered).toBe(true);
    });

    it('saves metric with blood_sugar type', async () => {
      await service.recordBloodSugar('user-uuid-1', { value: 5.5, timing: 'fasting' });
      const createCall = mockMetricRepo.create.mock.calls[0][0];
      expect(createCall.type).toBe('blood_sugar');
    });
  });
});
