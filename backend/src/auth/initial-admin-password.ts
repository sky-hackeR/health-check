export function validateInitialAdminPassword(
  password: string | undefined,
): string {
  const length = password === undefined ? 0 : Array.from(password).length;
  if (!password || length < 14 || length > 128 || !/\S/u.test(password)) {
    throw new Error(
      'INITIAL_ADMIN_PASSWORD must contain 14 to 128 characters and at least one non-whitespace character.',
    );
  }
  return password;
}
