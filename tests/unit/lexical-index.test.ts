import { describe, test, expect } from 'bun:test';
import { codeTokenize, LexicalIndex } from '../../src/services/lexical-index.js';

// ── codeTokenize ─────────────────────────────────────────────────────────────

describe('codeTokenize', () => {
  test('camelCase: handleUserAuth → contains handle, user, auth, handleuserauth', () => {
    const tokens = codeTokenize('handleUserAuth');
    expect(tokens).toContain('handle');
    expect(tokens).toContain('user');
    expect(tokens).toContain('auth');
    expect(tokens).toContain('handleuserauth');
  });

  test('PascalCase: UserProfileService → contains user, profile, service', () => {
    const tokens = codeTokenize('UserProfileService');
    expect(tokens).toContain('user');
    expect(tokens).toContain('profile');
    expect(tokens).toContain('service');
  });

  test('snake_case: user_profile_name → contains user, profile, name', () => {
    const tokens = codeTokenize('user_profile_name');
    expect(tokens).toContain('user');
    expect(tokens).toContain('profile');
    expect(tokens).toContain('name');
  });

  test('SCREAMING_SNAKE: REDIS_CONNECTION_TIMEOUT → contains redis, connection, timeout', () => {
    const tokens = codeTokenize('REDIS_CONNECTION_TIMEOUT');
    expect(tokens).toContain('redis');
    expect(tokens).toContain('connection');
    expect(tokens).toContain('timeout');
  });

  test('kebab-case: get-user-by-id → contains get, user, id', () => {
    const tokens = codeTokenize('get-user-by-id');
    expect(tokens).toContain('get');
    expect(tokens).toContain('user');
    expect(tokens).toContain('id');
  });

  test('dot.notation: req.body.name → contains req, body, name', () => {
    const tokens = codeTokenize('req.body.name');
    expect(tokens).toContain('req');
    expect(tokens).toContain('body');
    expect(tokens).toContain('name');
  });

  test('acronyms: getHTTPResponse → contains get, http, response', () => {
    const tokens = codeTokenize('getHTTPResponse');
    expect(tokens).toContain('get');
    expect(tokens).toContain('http');
    expect(tokens).toContain('response');
  });

  test('numbers: v2Config → contains config', () => {
    const tokens = codeTokenize('v2Config');
    expect(tokens).toContain('config');
  });

  test('empty/whitespace → []', () => {
    expect(codeTokenize('')).toEqual([]);
    expect(codeTokenize('   ')).toEqual([]);
  });

  test('single chars dropped: a b c → []', () => {
    expect(codeTokenize('a b c')).toEqual([]);
  });

  test('all output is lowercase', () => {
    const tokens = codeTokenize('HandleUserAuth SCREAMING_SNAKE getHTTPResponse');
    for (const t of tokens) {
      expect(t).toBe(t.toLowerCase());
    }
  });

  test('mixed separators: my_camelCase.thing-stuff → contains all sub-tokens', () => {
    const tokens = codeTokenize('my_camelCase.thing-stuff');
    expect(tokens).toContain('my');
    expect(tokens).toContain('camel');
    expect(tokens).toContain('case');
    expect(tokens).toContain('thing');
    expect(tokens).toContain('stuff');
  });
});

// ── LexicalIndex ─────────────────────────────────────────────────────────────

describe('LexicalIndex', () => {
  test('addDocument + query returns matching docs', () => {
    const idx = new LexicalIndex();
    idx.addDocument('doc1', 'function handleUserAuth() { return true; }', {
      filePath: 'src/auth.ts', chunkIndex: 0, lineStart: 1, lineEnd: 5,
    });

    const results = idx.query('handleUserAuth', 10);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].filePath).toBe('src/auth.ts');
  });

  test('removeDocument stops returning that doc', () => {
    const idx = new LexicalIndex();
    idx.addDocument('doc1', 'function handleUserAuth() {}', {
      filePath: 'src/auth.ts', chunkIndex: 0, lineStart: 1, lineEnd: 5,
    });

    idx.removeDocument('doc1');
    const results = idx.query('handleUserAuth', 10);
    expect(results).toEqual([]);
  });

  test('empty index query returns []', () => {
    const idx = new LexicalIndex();
    const results = idx.query('anything', 10);
    expect(results).toEqual([]);
  });

  test('duplicate doc ID replaces previous', () => {
    const idx = new LexicalIndex();
    idx.addDocument('doc1', 'old content alpha', {
      filePath: 'a.ts', chunkIndex: 0, lineStart: 1, lineEnd: 1,
    });
    idx.addDocument('doc1', 'new content beta', {
      filePath: 'a.ts', chunkIndex: 0, lineStart: 1, lineEnd: 1,
    });

    expect(idx.size).toBe(1);
    const results = idx.query('beta', 10);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].chunkText).toContain('beta');
  });

  test('save/load roundtrip preserves search capability', () => {
    const idx = new LexicalIndex();
    idx.addDocument('doc1', 'function handleUserAuth() {}', {
      filePath: 'src/auth.ts', chunkIndex: 0, lineStart: 1, lineEnd: 5,
    });
    idx.addDocument('doc2', 'const REDIS_CONNECTION_TIMEOUT = 5000', {
      filePath: 'src/config.ts', chunkIndex: 0, lineStart: 10, lineEnd: 10,
    });

    const json = idx.toJSON();
    const restored = LexicalIndex.fromJSON(json);

    const results = restored.query('handleUserAuth', 10);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].filePath).toBe('src/auth.ts');

    const results2 = restored.query('REDIS_CONNECTION', 10);
    expect(results2.length).toBeGreaterThan(0);
    expect(results2[0].filePath).toBe('src/config.ts');
  });

  test('prefix search: handleUser finds handleUserAuthentication', () => {
    const idx = new LexicalIndex();
    idx.addDocument('doc1', 'function handleUserAuthentication() {}', {
      filePath: 'src/auth.ts', chunkIndex: 0, lineStart: 1, lineEnd: 5,
    });

    const results = idx.query('handleUser', 10);
    expect(results.length).toBeGreaterThan(0);
  });

  test('special characters in query do not crash', () => {
    const idx = new LexicalIndex();
    idx.addDocument('doc1', 'some text', {
      filePath: 'a.ts', chunkIndex: 0, lineStart: 1, lineEnd: 1,
    });

    // Should not throw
    idx.query('$$foo!!', 10);
    idx.query('', 10);
    idx.query('()', 10);
  });

  test('size property reflects document count', () => {
    const idx = new LexicalIndex();
    expect(idx.size).toBe(0);

    idx.addDocument('doc1', 'text one', {
      filePath: 'a.ts', chunkIndex: 0, lineStart: 1, lineEnd: 1,
    });
    expect(idx.size).toBe(1);

    idx.addDocument('doc2', 'text two', {
      filePath: 'b.ts', chunkIndex: 0, lineStart: 1, lineEnd: 1,
    });
    expect(idx.size).toBe(2);

    idx.removeDocument('doc1');
    expect(idx.size).toBe(1);
  });

  test('dir filter works in query', () => {
    const idx = new LexicalIndex();
    idx.addDocument('doc1', 'function alpha() {}', {
      filePath: 'src/a.ts', chunkIndex: 0, lineStart: 1, lineEnd: 1,
    });
    idx.addDocument('doc2', 'function alpha() {}', {
      filePath: 'lib/b.ts', chunkIndex: 0, lineStart: 1, lineEnd: 1,
    });

    const results = idx.query('alpha', 10, { dir: 'src/' });
    expect(results).toHaveLength(1);
    expect(results[0].filePath).toBe('src/a.ts');
  });
});
