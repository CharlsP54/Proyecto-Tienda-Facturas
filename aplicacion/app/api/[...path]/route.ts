import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../chatgpt-auth';
import { handleApi } from '../../../lib/server';

export const dynamic = 'force-dynamic';
async function route(request: Request) {
  const user = await getChatGPTUser();
  return handleApi(request, env, user ? { userId: user.userId, email: user.email, displayName: user.displayName } : null);
}
export const GET = route;
export const POST = route;
