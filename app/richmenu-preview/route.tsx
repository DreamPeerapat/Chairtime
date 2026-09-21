// TEMPORARY — delete before committing. Renders the rich menu images without
// a session so the design can be looked at while the dev database is down.
import { ownerRichMenuImage, richMenuImage } from '@/lib/line/rich-menu';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const owner = new URL(request.url).searchParams.has('owner');
  return owner ? ownerRichMenuImage('ร้านสวยสตูดิโอ') : richMenuImage('ร้านสวยสตูดิโอ');
}
