import { NextResponse } from 'next/server'
import { AuthResult } from './auth'

/**
 * Create a JSON error response with consistent formatting.
 */
export function apiError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

/**
 * Create a JSON success response.
 */
export function apiSuccess<T>(data: T) {
  return NextResponse.json(data)
}

/**
 * Create a validation error response with details.
 */
export function apiValidationError(details: unknown) {
  return NextResponse.json(
    { error: 'Invalid request', details },
    { status: 400 }
  )
}

/**
 * Convert an AuthResult error to an appropriate HTTP response.
 */
export function authErrorResponse(authResult: AuthResult & { success: false }) {
  switch (authResult.error) {
    case 'UNAUTHORIZED':
      return apiError('Unauthorized', 401)
    case 'FORBIDDEN':
      return apiError('Forbidden', 403)
    case 'INTERNAL_ERROR':
      return apiError('Internal server error', 500)
  }
}
