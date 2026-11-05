export const AUTH_CONFIGURATION = Symbol('AUTH_CONFIGURATION');

export interface AuthConfiguration {
  rateLimitSecret: string | undefined;
  sessionTtlSeconds: string | undefined;
  frontendUrl: string;
  nodeEnv: string;
}
