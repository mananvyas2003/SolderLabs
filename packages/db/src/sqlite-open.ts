import { DatabaseSync, type SQLInputValue } from "node:sqlite";

export type SqlStatement = {
  run: (...args: unknown[]) => unknown;
  get: (...args: unknown[]) => unknown;
  all: (...args: unknown[]) => unknown[];
};

export type Sql = {
  exec: (sql: string) => void;
  pragma: (sql: string) => void;
  prepare: (sql: string) => SqlStatement;
  transaction: <T>(fn: () => T) => () => T;
  inTransaction: boolean;
  close: () => void;
};

function bindArgs(args: unknown[]): SQLInputValue[] {
  return args.map((a) => a as SQLInputValue);
}

export function openSqliteFile(filePath: string): Sql {
  const db = new DatabaseSync(filePath);
  let depth = 0;
  const sql: Sql = {
    get inTransaction() {
      return depth > 0;
    },
    exec(text: string) {
      db.exec(text);
    },
    pragma(text: string) {
      db.exec(text.startsWith("PRAGMA") ? text : `PRAGMA ${text}`);
    },
    prepare(text: string) {
      const stmt = db.prepare(text);
      return {
        run: (...args: unknown[]) => stmt.run(...bindArgs(args)),
        get: (...args: unknown[]) => stmt.get(...bindArgs(args)),
        all: (...args: unknown[]) => stmt.all(...bindArgs(args)) as unknown[],
      };
    },
    transaction<T>(fn: () => T) {
      return () => {
        if (depth > 0) return fn();
        db.exec("BEGIN IMMEDIATE");
        depth += 1;
        try {
          const result = fn();
          db.exec("COMMIT");
          return result;
        } catch (err) {
          try {
            db.exec("ROLLBACK");
          } catch (rollbackErr) {
            throw new Error(
              `ROLLBACK failed (${rollbackErr instanceof Error ? rollbackErr.message : rollbackErr}); original: ${err instanceof Error ? err.message : err}`,
            );
          }
          throw err;
        } finally {
          depth -= 1;
        }
      };
    },
    close() {
      db.close();
    },
  };
  return sql;
}
