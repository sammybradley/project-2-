/** Thrown by handlers and the store for problems that are the caller's fault (400/404). */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Thrown by the store when it can't answer at all – the equivalent of a database outage. */
export class StoreUnavailable extends Error {}
