export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

export function notFound(message) {
  return new ApiError(404, message || 'Not found');
}

export function badRequest(message, details) {
  return new ApiError(400, message || 'Bad request', details);
}

export function unauthorized(message) {
  return new ApiError(401, message || 'Unauthorized');
}

export function forbidden(message) {
  return new ApiError(403, message || 'Forbidden');
}

export function conflict(message) {
  return new ApiError(409, message || 'Conflict');
}