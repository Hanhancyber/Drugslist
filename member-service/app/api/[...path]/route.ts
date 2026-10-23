import {env,waitUntil} from 'cloudflare:workers';
import {handleAPI} from '../../../lib/community-api.mjs';
import drugIds from '../../../generated/drug-ids.json';
export const dynamic='force-dynamic';
const ids=new Set(drugIds);
const handle=(request:Request)=>handleAPI(request,env.DB,ids,{env,waitUntil});
export {handle as GET,handle as POST,handle as DELETE};
