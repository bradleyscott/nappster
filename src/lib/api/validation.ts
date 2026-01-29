import { ZodSchema } from 'zod'
import { apiValidationError } from './responses'

type ValidationSuccess<T> = { valid: true; data: T }
type ValidationFailure = { valid: false; response: ReturnType<typeof apiValidationError> }

/**
 * Validate request body against a Zod schema.
 * Returns either the validated data or an error response ready to return.
 */
export function validateRequest<T>(
  body: unknown,
  schema: ZodSchema<T>
): ValidationSuccess<T> | ValidationFailure {
  const result = schema.safeParse(body)
  if (!result.success) {
    return {
      valid: false,
      response: apiValidationError(result.error.flatten()),
    }
  }
  return { valid: true, data: result.data }
}
