import { validateInitialAdminPassword } from './initial-admin-password';

describe('validateInitialAdminPassword', () => {
  it('accepts a password within the configured length bounds', () => {
    expect(validateInitialAdminPassword('correct horse battery')).toBe(
      'correct horse battery',
    );
  });

  it('rejects a missing, too-short, too-long, or whitespace-only password', () => {
    expect(() => validateInitialAdminPassword(undefined)).toThrow();
    expect(() => validateInitialAdminPassword('short')).toThrow();
    expect(() => validateInitialAdminPassword('a'.repeat(129))).toThrow();
    expect(() => validateInitialAdminPassword(' '.repeat(14))).toThrow();
  });
});
