import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type RegistrationType = 'VISITOR' | 'EXHIBITOR';

export interface Event {
  id: string;
  name: string;
  company: string;
  date: string;
  location: string;
  createdBy: string;
  createdAt: any;
}

export interface Attendee {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  role: string;
  industry: string;
  referral: string;
  intent: string;
  type: RegistrationType;
  eventId: string;
  eventLocation: string;
  companyId: string;
  createdAt: any;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}
