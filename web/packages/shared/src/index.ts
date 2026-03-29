// Shared types and utilities for Health Guardian

export interface User {
  id: string;
  phone: string;
  name: string;
  age?: number;
  avatar?: string;
  healthTags: string[];
}

export interface HealthReport {
  id: string;
  userId: string;
  reportType: string;
  reportDate: string;
  hospital: string;
  aiSummary?: string;
  status: string;
  fileUrl?: string;
}

export interface HealthTask {
  id: string;
  userId: string;
  type: string;
  title: string;
  description?: string;
  completed: boolean;
  dueDate?: string;
  recurrence?: string;
  scheduledTime?: string;
  priority?: string;
  creatorRole?: 'self' | 'family' | 'system';
}

export interface HealthMetric {
  id: string;
  userId: string;
  type: string;
  systolic?: number;
  diastolic?: number;
  value?: number;
  unit: string;
  measuredAt: string;
}

export interface Medication {
  id: string;
  userId: string;
  name: string;
  dosage: string;
  frequency: string;
  timing: string[];
  active: boolean;
}

export interface Recheck {
  id: string;
  userId: string;
  itemName: string;
  checkType: string;
  dueDate: string;
  status: string;
}

export interface FamilyMember {
  id: string;
  userId: string;
  elderUserId: string;
  relationship: string;
  canViewReports: boolean;
  canViewMetrics: boolean;
}
