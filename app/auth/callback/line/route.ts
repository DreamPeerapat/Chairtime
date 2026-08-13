import { handleOAuthCallback } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return handleOAuthCallback('line', request);
}
