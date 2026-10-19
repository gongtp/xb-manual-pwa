import { mkdirSync } from "node:fs";
import path from "node:path";
import { migrateGameCodes } from "./migrate-game-codes.ts";
import { exportDatabase, restoreDatabase, type BackupRow } from "../lib/backup.ts";
import {
  DatabaseSync,
  type SQLInputValue,
  type SQLOutputValue,
  type StatementSync,
} from "node:sqlite";

const DEFAULT_DATABASE_PATH = path.join("data", "xeno-archive.sqlite");

type SqliteRow = Record<string, SQLOutputValue>;

type SqliteResultMeta = {
  changes: number;
  last_row_id: number;
};

export type SqliteResult<T = SqliteRow> = {
  success: true;
  results: T[];
  meta: SqliteResultMeta;
};

function asNumber(value: number | bigint) {
  return typeof value === "bigint" ? Number(value) : value;
}

export class SqlitePreparedStatement {
  private readonly statement: StatementSync;
  private readonly values: SQLInputValue[];

  constructor(
    statement: StatementSync,
    values: SQLInputValue[] = [],
  ) {
    this.statement = statement;
    this.values = values;
  }

  bind(...values: SQLInputValue[]) {
    return new SqlitePreparedStatement(this.statement, values);
  }

  async run(): Promise<SqliteResult> {
    const result = this.statement.run(...this.values);
    return {
      success: true,
      results: [],
      meta: {
        changes: asNumber(result.changes),
        last_row_id: asNumber(result.lastInsertRowid),
      },
    };
  }

  async first<T = SqliteRow>(): Promise<T | null> {
    return (this.statement.get(...this.values) as unknown as T | undefined) ?? null;
  }

  async all<T = SqliteRow>(): Promise<SqliteResult<T>> {
    return {
      success: true,
      results: this.statement.all(...this.values) as unknown as T[],
      meta: { changes: 0, last_row_id: 0 },
    };
  }

  runInBatch() {
    return this.statement.run(...this.values);
  }
}

export class SqliteDatabase {
  private readonly database: DatabaseSync;
  readonly filename: string;

  constructor(filename: string) {
    this.filename = filename;
    mkdirSync(path.dirname(filename), { recursive: true });
    this.database = new DatabaseSync(filename, {
      enableForeignKeyConstraints: true,
      timeout: 5_000,
    });
    this.database.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA journal_mode = DELETE;
      PRAGMA synchronous = NORMAL;
    `);
    migrateGameCodes(this.database);
  }

  prepare(sql: string) {
    return new SqlitePreparedStatement(this.database.prepare(sql));
  }

  async batch(statements: SqlitePreparedStatement[]) {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const results = statements.map((statement) => statement.runInBatch());
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  close() {
    this.database.close();
  }

  private backupDriver() {
    return {
      exec: (sql: string) => this.database.exec(sql),
      rows: (sql: string) => this.database.prepare(sql).all() as BackupRow[],
      run: (sql: string, values: (string | number)[]) => { this.database.prepare(sql).run(...values); },
    };
  }

  exportBackup() { return exportDatabase(this.backupDriver()); }
  restoreBackup(value: unknown) { restoreDatabase(this.backupDriver(), value); }
}

type DatabaseGlobal = typeof globalThis & {
  __xenoArchiveSqlite?: SqliteDatabase;
};

export function getDatabasePath() {
  const configuredPath = process.env.SQLITE_DATABASE_PATH?.trim();
  return path.resolve(process.cwd(), configuredPath || DEFAULT_DATABASE_PATH);
}

export function getSqlite() {
  const globalDatabase = globalThis as DatabaseGlobal;
  globalDatabase.__xenoArchiveSqlite ??= new SqliteDatabase(getDatabasePath());
  return globalDatabase.__xenoArchiveSqlite;
}
