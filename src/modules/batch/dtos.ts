import { z } from 'zod';
import {
  batchRequestSchema,
  batchResponseSchema,
} from '@/modules/redaction/schemas.js';

export type BatchRequest = z.infer<typeof batchRequestSchema>;
export type BatchResponse = z.infer<typeof batchResponseSchema>;

export interface JobStatus {
  job_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  created_at: string;
  started_at?: string;
  completed_at?: string;
  progress: {
    total: number;
    completed: number;
    failed: number;
    pending: number;
  };
  items: JobItemStatus[];
  webhook_url?: string;
  webhook_delivered?: boolean;
  webhook_attempts?: number;
}

export interface JobItemStatus {
  index: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  input: {
    bucket: string;
    key: string;
  };
  output?: {
    bucket: string;
    key: string;
  };
  processing_time_ms?: number;
  error?: string;
  started_at?: string;
  completed_at?: string;
}
