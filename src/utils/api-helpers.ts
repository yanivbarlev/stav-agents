/**
 * API Helper Functions
 *
 * Shared utilities for Express API endpoints.
 */

import { Response } from 'express';

/**
 * Format error message from unknown error type
 */
export function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return 'Unknown error';
}

/**
 * Send an API error response with consistent formatting
 */
export function sendErrorResponse(
  res: Response,
  statusCode: number,
  errorMessage: string,
  error?: unknown
): void {
  const response: { error: string; details?: string } = {
    error: errorMessage,
  };

  if (error) {
    response.details = formatErrorMessage(error);
  }

  res.status(statusCode).json(response);
}

/**
 * Log and send an API error response
 */
export function handleApiError(
  res: Response,
  context: string,
  error: unknown
): void {
  console.error(`[API] Error ${context}:`, error);
  sendErrorResponse(res, 500, `Failed to ${context}`, error);
}
