export function getAllowedOrigins(
  frontendUrl: string,
  nodeEnv: string,
): Set<string> {
  const allowedOrigins = new Set([new URL(frontendUrl).origin]);
  if (nodeEnv === 'development') {
    allowedOrigins.add('http://localhost:3000');
  }
  return allowedOrigins;
}
