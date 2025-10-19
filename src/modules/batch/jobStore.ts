import { Job, JobItem } from '@/modules/redaction/dtos.js';
import { S3RedactionRequest, S3RedactionResponse } from '@/modules/redaction/dtos.js';
import { generateRandomId } from '@/utils/hash.js';

/**
 * In-memory job store for batch processing
 * In production, this should be replaced with Redis or a database
 */
export class JobStore {
  private jobs: Map<string, Job> = new Map();
  private readonly MAX_JOBS = 1000; // Limit in-memory storage
  private readonly JOB_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Create a new job
   */
  createJob(requests: S3RedactionRequest[], webhookUrl?: string): Job {
    const jobId = generateRandomId(16);

    const job: Job = {
      id: jobId,
      status: 'pending',
      items: requests.map((request, index) => ({
        id: `${jobId}-${index}`,
        request,
        status: 'pending',
      })),
      webhookUrl,
      createdAt: new Date(),
      progress: {
        total: requests.length,
        completed: 0,
        failed: 0,
      },
    };

    // Clean up old jobs if limit reached
    this.cleanupOldJobs();

    this.jobs.set(jobId, job);
    return job;
  }

  /**
   * Get job by ID
   */
  getJob(jobId: string): Job | undefined {
    return this.jobs.get(jobId);
  }

  /**
   * Update job status
   */
  updateJobStatus(jobId: string, status: Job['status']): void {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    job.status = status;

    if (status === 'processing' && !job.startedAt) {
      job.startedAt = new Date();
    }

    if ((status === 'completed' || status === 'failed') && !job.completedAt) {
      job.completedAt = new Date();
    }

    this.jobs.set(jobId, job);
  }

  /**
   * Update job item
   */
  updateJobItem(
    jobId: string,
    itemId: string,
    update: Partial<JobItem>
  ): void {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    const itemIndex = job.items.findIndex(item => item.id === itemId);
    if (itemIndex === -1) {
      throw new Error(`Job item ${itemId} not found in job ${jobId}`);
    }

    job.items[itemIndex] = {
      ...job.items[itemIndex],
      ...update,
    };

    // Update job progress
    this.updateJobProgress(job);

    this.jobs.set(jobId, job);
  }

  /**
   * Mark item as processing
   */
  startJobItem(jobId: string, itemId: string): void {
    this.updateJobItem(jobId, itemId, {
      status: 'processing',
      startedAt: new Date(),
    });
  }

  /**
   * Mark item as completed
   */
  completeJobItem(
    jobId: string,
    itemId: string,
    result: S3RedactionResponse
  ): void {
    this.updateJobItem(jobId, itemId, {
      status: 'completed',
      result,
      completedAt: new Date(),
    });
  }

  /**
   * Mark item as failed
   */
  failJobItem(jobId: string, itemId: string, error: string): void {
    this.updateJobItem(jobId, itemId, {
      status: 'failed',
      error,
      completedAt: new Date(),
    });
  }

  /**
   * Update job progress and overall status
   */
  private updateJobProgress(job: Job): void {
    const completed = job.items.filter(item => item.status === 'completed').length;
    const failed = job.items.filter(item => item.status === 'failed').length;

    job.progress.completed = completed;
    job.progress.failed = failed;

    // Update overall job status
    if (completed + failed === job.progress.total) {
      job.status = failed === 0 ? 'completed' : 'failed';
      job.completedAt = new Date();
    } else if (job.status === 'pending') {
      job.status = 'processing';
      if (!job.startedAt) {
        job.startedAt = new Date();
      }
    }
  }

  /**
   * Get all jobs (for admin/debugging)
   */
  getAllJobs(): Job[] {
    return Array.from(this.jobs.values());
  }

  /**
   * Delete a job
   */
  deleteJob(jobId: string): boolean {
    return this.jobs.delete(jobId);
  }

  /**
   * Clean up old jobs to prevent memory leaks
   */
  private cleanupOldJobs(): void {
    const now = Date.now();
    const jobsToDelete: string[] = [];

    for (const [jobId, job] of this.jobs.entries()) {
      const jobAge = now - job.createdAt.getTime();

      // Delete jobs older than TTL
      if (jobAge > this.JOB_TTL_MS) {
        jobsToDelete.push(jobId);
      }
    }

    // If still over limit, delete oldest jobs
    if (this.jobs.size - jobsToDelete.length > this.MAX_JOBS) {
      const sortedJobs = Array.from(this.jobs.entries())
        .sort(([, a], [, b]) => a.createdAt.getTime() - b.createdAt.getTime());

      const excess = this.jobs.size - jobsToDelete.length - this.MAX_JOBS;
      for (let i = 0; i < excess; i++) {
        jobsToDelete.push(sortedJobs[i][0]);
      }
    }

    for (const jobId of jobsToDelete) {
      this.jobs.delete(jobId);
    }

    if (jobsToDelete.length > 0) {
      console.log(`Cleaned up ${jobsToDelete.length} old jobs`);
    }
  }

  /**
   * Get job count
   */
  getJobCount(): number {
    return this.jobs.size;
  }
}

// Singleton instance
let jobStoreInstance: JobStore;

export function getJobStore(): JobStore {
  if (!jobStoreInstance) {
    jobStoreInstance = new JobStore();
  }
  return jobStoreInstance;
}
