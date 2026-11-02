import type { AiProviderName } from '@clear-a11y/core';

export interface CompletionImage {
  /** e.g. "image/png" */
  mediaType: string;
  /** Base64 without a data: prefix. */
  data: string;
}

export interface CompletionRequest {
  system: string;
  prompt: string;
  images?: CompletionImage[];
  maxTokens?: number;
  /** JSON schema of the expected answer; adapters pass it as their structured-output option. */
  jsonSchema?: object;
  /** Aborts the request (engine time budget). */
  signal?: AbortSignal;
  /**
   * Not sent to remote models. Lets the mock provider look up recorded responses by judge and
   * a stable hash of the (normalized) candidate input.
   */
  meta?: {
    judge: string;
    promptVersion: number;
    key: string;
    input: Record<string, unknown>;
  };
}

export interface CompletionResponse {
  text: string;
  model: string;
}

export interface AiProvider {
  name: AiProviderName;
  /** False for `none`: judges are skipped and nothing is sent. */
  available: boolean;
  /** True when requests leave the machine. */
  remote: boolean;
  complete(req: CompletionRequest): Promise<CompletionResponse>;
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** Injected dependencies (tests stub fetch and env; nothing global is touched). */
export interface ProviderDeps {
  fetch?: FetchLike;
  env?: Record<string, string | undefined>;
  /** Backoff sleep; tests pass a no-op. */
  sleep?: (ms: number) => Promise<void>;
  /** mock provider: recorded responses (see `MockRecording`). */
  recordings?: readonly MockRecording[];
}

/** A recorded or hand-written model answer for the mock provider. */
export interface MockRecording {
  name?: string;
  /** "synthetic" for hand-written responses, otherwise the provider/model it came from. */
  source?: string;
  request: {
    judge: string;
    promptVersion?: number;
    /** Exact candidate input: matched by stable hash. */
    input?: Record<string, unknown>;
    /** Partial input: every listed field must equal the candidate's field. */
    match?: Record<string, unknown>;
  };
  /** The model's answer: an object (serialized to JSON) or raw text. */
  response: unknown;
}
