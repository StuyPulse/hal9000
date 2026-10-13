import * as SQLite from 'expo-sqlite';
import type { LocalSubmission, LocalPhoto } from './types';
import { acknowledge,failRevision } from './sync-model';

let database: Promise<SQLite.SQLiteDatabase> | null = null;
export function openStore() {
 return database ??= (async()=>{const db=await SQLite.openDatabaseAsync('hal9000-mobile.db');await db.execAsync('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=10000; CREATE TABLE IF NOT EXISTS local_items(scope TEXT NOT NULL, kind TEXT NOT NULL, id TEXT NOT NULL, json TEXT NOT NULL, PRIMARY KEY(scope,kind,id));');return db})();
}
export async function putValue(scope:string,kind:string,id:string,value:unknown) {const db=await openStore();await db.runAsync('INSERT INTO local_items(scope,kind,id,json) VALUES(?,?,?,?) ON CONFLICT(scope,kind,id) DO UPDATE SET json=excluded.json',scope,kind,id,JSON.stringify(value));}
export async function getValue<T>(scope:string,kind:string,id:string):Promise<T|null>{const db=await openStore();const row=await db.getFirstAsync<{json:string}>('SELECT json FROM local_items WHERE scope=? AND kind=? AND id=?',scope,kind,id);return row?JSON.parse(row.json) as T:null;}
export async function listValues<T>(scope:string,kind:string):Promise<T[]>{const db=await openStore();const rows=await db.getAllAsync<{json:string}>('SELECT json FROM local_items WHERE scope=? AND kind=? ORDER BY id',scope,kind);return rows.map(r=>JSON.parse(r.json) as T);}
export async function removeValue(scope:string,kind:string,id:string){const db=await openStore();await db.runAsync('DELETE FROM local_items WHERE scope=? AND kind=? AND id=?',scope,kind,id);}
export async function acknowledgeStored(scope:string,id:string,revision:number,serverUpdatedAt:string|null){const db=await openStore();await db.withExclusiveTransactionAsync(async tx=>{const row=await tx.getFirstAsync<{json:string}>('SELECT json FROM local_items WHERE scope=? AND kind=? AND id=?',scope,'entry',id);if(!row)return;const latest=JSON.parse(row.json) as LocalSubmission;await tx.runAsync('UPDATE local_items SET json=? WHERE scope=? AND kind=? AND id=?',JSON.stringify(acknowledge(latest,revision,serverUpdatedAt)),scope,'entry',id)});}
export const listRecords=(scope:string)=>listValues<LocalSubmission>(scope,'entry');
export async function failStored(scope:string,id:string,revision:number,error:string){const db=await openStore();await db.withExclusiveTransactionAsync(async tx=>{const row=await tx.getFirstAsync<{json:string}>('SELECT json FROM local_items WHERE scope=? AND kind=? AND id=?',scope,'entry',id);if(!row)return;const latest=JSON.parse(row.json) as LocalSubmission;await tx.runAsync('UPDATE local_items SET json=? WHERE scope=? AND kind=? AND id=?',JSON.stringify(failRevision(latest,revision,error)),scope,'entry',id)});}
export const listPhotos=(scope:string)=>listValues<LocalPhoto>(scope,'photo');
