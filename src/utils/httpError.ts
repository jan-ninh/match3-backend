export type HttpErrorDetails = Record<string, unknown> | null;

export class HttpError extends Error {
  public readonly status: number;
  public readonly details?: HttpErrorDetails;

  constructor(status: number, message: string, details?: HttpErrorDetails) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function isHttpError(value: unknown): value is HttpError {
  return (
    typeof value === "object" &&
    value !== null &&
    "status" in value &&
    typeof (value as any).status === "number" &&
    "message" in value &&
    typeof (value as any).message === "string"
  );
}
