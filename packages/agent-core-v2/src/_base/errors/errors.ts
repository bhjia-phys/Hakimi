/**
 * Base error classes shared by every domain — `Error2` and related
 * control-flow errors.
 */

import { CoreErrors } from './codes';
import type { ErrorCode } from '#/errors';

export class ExpectedError extends Error {
  readonly isExpected = true;
}

export class ErrorNoTelemetry extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'CodeExpectedError';
  }

  static fromError(error: Error): ErrorNoTelemetry {
    const wrapped = new ErrorNoTelemetry(error.message);
    wrapped.stack = error.stack;
    return wrapped;
  }

  static isErrorNoTelemetry(error: unknown): error is ErrorNoTelemetry {
    return error instanceof Error && error.name === 'CodeExpectedError';
  }
}

export class BugIndicatingError extends Error {
  constructor(message?: string) {
    super(message ?? 'An unexpected bug occurred.');
    this.name = 'BugIndicatingError';
  }
}

export interface Error2Options {
  readonly details?: Readonly<Record<string, unknown>>;
  readonly cause?: unknown;
  readonly name?: string;
}

const ERROR2_BRAND = Symbol.for('@moonshot-ai/agent-core-v2/Error2');

export class Error2 extends Error {
  declare readonly [ERROR2_BRAND]: true;
  readonly code: ErrorCode;
  readonly details?: Readonly<Record<string, unknown>>;

  constructor(code: ErrorCode, message: string, options?: Error2Options) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    Object.defineProperty(this, ERROR2_BRAND, { value: true });
    this.name = options?.name ?? 'Error2';
    this.code = code;
    this.details = options?.details;
  }
}

export function isError2(error: unknown): error is Error2 {
  return (
    error instanceof Error2 ||
    (typeof error === 'object' &&
      error !== null &&
      (error as { readonly [ERROR2_BRAND]?: unknown })[ERROR2_BRAND] === true)
  );
}

export function unwrapErrorCause(error: unknown): unknown {
  let current = error;
  while (isError2(current) && current.cause !== undefined) {
    current = current.cause;
  }
  return current;
}

export class NotImplementedError extends Error2 {
  constructor(feature?: string) {
    super(
      CoreErrors.codes.NOT_IMPLEMENTED,
      feature ? `Not implemented: ${feature}` : 'Not implemented',
    );
    this.name = 'NotImplementedError';
  }
}
