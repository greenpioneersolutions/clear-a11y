import type { Job, JobEventType, JobListener } from './types.js';

/** Tiny synchronous emitter shared by the implementations. A throwing listener never breaks the queue. */
export class JobEmitter<TPayload, TResult> {
  private readonly listeners = new Set<JobListener<TPayload, TResult>>();

  subscribe(listener: JobListener<TPayload, TResult>): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(type: JobEventType, job: Job<TPayload, TResult> | undefined): void {
    if (!job) return;
    for (const listener of this.listeners) {
      try {
        listener({ type, job });
      } catch {
        // Listeners are observers; their errors are theirs.
      }
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
