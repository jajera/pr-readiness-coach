export type CoachErrorCode =
  | 'GIT_FAILURE'
  | 'NO_GIT_REPO'
  | 'USAGE'
  | 'API_TRANSPORT'
  | 'API_ERROR'
  | 'INTERNAL';

export class CoachError extends Error {
  readonly code: CoachErrorCode;
  readonly exitCode: number;

  constructor(code: CoachErrorCode, message: string, exitCode = 2) {
    super(message);
    this.name = 'CoachError';
    this.code = code;
    this.exitCode = exitCode;
  }
}
