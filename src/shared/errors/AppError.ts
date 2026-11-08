export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 400,
    public errors: unknown[] = [],
  ) {
    super(message);
    this.name = "AppError";
  }
}