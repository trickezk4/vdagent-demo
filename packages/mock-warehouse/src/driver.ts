import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export interface PreparedStatement {
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
  run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
}

export interface ISqliteDb {
  exec(sql: string): void;
  prepare(sql: string): PreparedStatement;
  close(): void;
  engineName: 'better-sqlite3' | 'node:sqlite';
}

/**
 * Creates a SQLite database connection with automatic dual-engine resilience:
 * 1. Attempts better-sqlite3 first (native prebuilt, high performance)
 * 2. Falls back to Node 22 built-in node:sqlite (zero dependency, pure Node.js)
 */
export function createDatabaseConnection(dbPath: string = ':memory:'): ISqliteDb {
  // Strategy 1: Attempt better-sqlite3
  try {
    const BetterSqlite3 = require('better-sqlite3');
    const db = new BetterSqlite3(dbPath);
    try {
      db.pragma('journal_mode = WAL');
      db.pragma('foreign_keys = ON');
    } catch {
      // Memory db may not support WAL, ignore pragma error
    }

    return {
      exec: (sql: string) => {
        db.exec(sql);
      },
      prepare: (sql: string): PreparedStatement => {
        const stmt = db.prepare(sql);
        return {
          all: (...params: unknown[]) => stmt.all(...params),
          get: (...params: unknown[]) => stmt.get(...params),
          run: (...params: unknown[]) => stmt.run(...params),
        };
      },
      close: () => {
        db.close();
      },
      engineName: 'better-sqlite3',
    };
  } catch (betterSqliteError) {
    // Strategy 2: Attempt Node 22 built-in node:sqlite
    try {
      const { DatabaseSync } = require('node:sqlite');
      const db = new DatabaseSync(dbPath);
      try {
        db.exec('PRAGMA foreign_keys = ON;');
      } catch {
        // Ignore pragma error
      }

      return {
        exec: (sql: string) => {
          db.exec(sql);
        },
        prepare: (sql: string): PreparedStatement => {
          const stmt = db.prepare(sql);
          return {
            all: (...params: unknown[]) => stmt.all(...params) as unknown[],
            get: (...params: unknown[]) => stmt.get(...params) as unknown,
            run: (...params: unknown[]) =>
              stmt.run(...params) as { changes: number; lastInsertRowid: number | bigint },
          };
        },
        close: () => {
          db.close();
        },
        engineName: 'node:sqlite',
      };
    } catch (nodeSqliteError) {
      throw new Error(
        `[mock-warehouse] Failed to initialize SQLite engine. Both better-sqlite3 (${(betterSqliteError as Error).message}) and node:sqlite (${(nodeSqliteError as Error).message}) failed.`
      );
    }
  }
}
