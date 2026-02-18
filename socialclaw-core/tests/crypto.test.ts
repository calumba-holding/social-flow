process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/socialclaw';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-123';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'deterministic-test-key';

import { decryptSecret, encryptSecret } from '../src/security/crypto';

describe('credential crypto', () => {
  it('encrypts and decrypts round-trip', () => {
    const cipher = encryptSecret('my-secret-token');
    expect(cipher.split('.').length).toBe(3);
    const plain = decryptSecret(cipher);
    expect(plain).toBe('my-secret-token');
  });
});
