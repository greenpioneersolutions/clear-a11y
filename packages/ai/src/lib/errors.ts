/** Configuration problem: wrong or missing provider settings. Not retried; stops AI judging. */
export class AiConfigError extends Error {
  override name = 'AiConfigError';
}

/** A model request failed (HTTP error, timeout, malformed response). */
export class AiProviderError extends Error {
  override name = 'AiProviderError';
  constructor(
    message: string,
    readonly status?: number,
    readonly retryable = false,
  ) {
    super(message);
  }

  /** Authentication or permission failures: further calls in this scan would fail too. */
  get fatal(): boolean {
    return this.status === 401 || this.status === 403;
  }
}
