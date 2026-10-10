import mongoose from 'mongoose';
import {postgresModel,transaction,connectPostgres,disconnectPostgres} from './postgres.js';
export const postgresMode=Boolean(process.env.DATABASE_URL)||process.env.PG_TEST==='true';
const connection={readyState:0,transaction};
const facade=new Proxy(mongoose,{get(target,key){if(!postgresMode)return Reflect.get(target,key);if(key==='connection')return connection;if(key==='model')return postgresModel;if(key==='connect')return async(uri)=>{await connectPostgres(uri);connection.readyState=1;};if(key==='disconnect')return async()=>{await disconnectPostgres();connection.readyState=0;};return Reflect.get(target,key);}});
export default facade;
