import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../chatgpt-auth';
import {handleAPI} from '../../../server/backend.mjs';
export const dynamic='force-dynamic';
async function route(request:Request){return handleAPI(request,env,await getChatGPTUser());}
export {route as GET,route as POST,route as PATCH,route as DELETE};
