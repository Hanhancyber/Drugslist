import catalog from '../generated/catalog.html?raw';
import home from '../generated/home.html?raw';
export const dynamic='force-dynamic';
export function GET(request:Request){const params=new URL(request.url).searchParams;const html=params.has('drug')||params.has('join')?catalog:home;return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'"}});}
