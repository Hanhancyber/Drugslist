import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
export function setup(){
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
 const db={prepare(query){const statement=sql.prepare(query);const bound=args=>({first(){return statement.get(...args)||null;},all(){return {results:statement.all(...args)};},run(){const result=statement.run(...args);return {meta:{changes:Number(result.changes)}};}});return {...bound([]),bind(...args){return bound(args);}};},async batch(statements){sql.exec('BEGIN');try{const result=statements.map(st=>st.run());sql.exec('COMMIT');return result;}catch(e){sql.exec('ROLLBACK');throw e;}}};return {db,sql};
}
