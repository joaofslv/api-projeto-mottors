export function successResponse<T>(data: T, meta: Record<string, unknown> = {}) {
  return { success: true, data, meta };
}

export function errorResponse(message: string, errors: unknown[] = []) {
  return { success: false, message, errors };
}