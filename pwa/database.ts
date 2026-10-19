import initSqlJs, { type Database, type SqlJsStatic, type SqlValue } from "sql.js";
import { exportDatabase, restoreDatabase, type BackupRow } from "../lib/backup";

export class SqlitePreparedStatement {
  constructor(private database: Database, private sql: string, private values: SqlValue[] = []) {}
  bind(...values: SqlValue[]) { return new SqlitePreparedStatement(this.database, this.sql, values); }
  async run() { this.runInBatch(); return { success: true as const, results: [], meta: { changes: this.database.getRowsModified(), last_row_id: 0 } }; }
  async first<T = BackupRow>(): Promise<T | null> { return (await this.all<T>()).results[0] ?? null; }
  async all<T = BackupRow>() {
    const statement = this.database.prepare(this.sql);
    try {
      statement.bind(this.values);
      const results: T[] = [];
      while (statement.step()) results.push(statement.getAsObject() as T);
      return { success: true as const, results, meta: { changes: 0, last_row_id: 0 } };
    } finally { statement.free(); }
  }
  runInBatch() { this.database.run(this.sql, this.values); }
}

export class SqliteDatabase {
  constructor(private database: Database) { database.run("PRAGMA foreign_keys = ON"); }
  prepare(sql: string) { return new SqlitePreparedStatement(this.database, sql); }
  async batch(statements: SqlitePreparedStatement[]) {
    this.database.run("BEGIN IMMEDIATE");
    try {
      statements.forEach((statement) => statement.runInBatch());
      this.database.run("COMMIT");
      return [];
    } catch (error) { this.database.run("ROLLBACK"); throw error; }
  }
  private backupDriver() {
    return {
      exec: (sql: string) => { this.database.run(sql); },
      rows: (sql: string): BackupRow[] => {
        const statement = this.database.prepare(sql);
        const rows: BackupRow[] = [];
        try { while (statement.step()) rows.push(statement.getAsObject() as BackupRow); }
        finally { statement.free(); }
        return rows;
      },
      run: (sql: string, values: (string | number)[]) => { this.database.run(sql, values); },
    };
  }
  exportBackup() { return exportDatabase(this.backupDriver()); }
  restoreBackup(value: unknown) { restoreDatabase(this.backupDriver(), value); }
  bytes() {
    const bytes = this.database.export();
    // sql.js export reopens the connection and resets connection pragmas.
    this.database.run("PRAGMA foreign_keys = ON");
    return bytes;
  }
  close() { this.database.close(); }
}

let current: SqliteDatabase | undefined;
let sqlPromise: Promise<SqlJsStatic> | undefined;
let storagePromise: Promise<IDBDatabase> | undefined;
const storageName = `xeno-archive:${import.meta.env.BASE_URL}`;

function storage() {
  storagePromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(storageName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("database");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("无法打开本机存储，请检查浏览器存储权限"));
  });
  return storagePromise;
}

async function loadBytes() {
  const db = await storage();
  return new Promise<Uint8Array | undefined>((resolve, reject) => {
    const request = db.transaction("database", "readonly").objectStore("database").get("current");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function persistBytes(bytes: Uint8Array) {
  const db = await storage();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction("database", "readwrite");
    transaction.objectStore("database").put(bytes, "current");
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(new Error("本机数据保存失败（可能空间不足），本次修改未保存。请导出备份并释放空间后重试。"));
    transaction.onerror = () => { /* onabort reports the transaction failure */ };
  });
}

export function getSqlite() {
  if (!current) throw new Error("本机数据库尚未初始化");
  return current;
}

/** Serialize across tabs, reload the latest committed snapshot, acknowledge only after IDB commit. */
export async function withLocalDatabase(action: () => Promise<Response>, persist = true) {
  if (!navigator.locks) throw new Error("此浏览器不支持安全的本地数据库访问，请更新 iOS/Safari 后重试");
  return navigator.locks.request(storageName, async () => {
    sqlPromise ??= initSqlJs({ locateFile: () => `${import.meta.env.BASE_URL}sql-wasm.wasm` });
    const SQL = await sqlPromise;
    const bytes = await loadBytes();
    current = new SqliteDatabase(bytes ? new SQL.Database(bytes) : new SQL.Database());
    try {
      const response = await action();
      if (response.ok && persist) await persistBytes(current.bytes());
      return response;
    } finally { current.close(); current = undefined; }
  });
}
