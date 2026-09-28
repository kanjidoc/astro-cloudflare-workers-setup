// Unauthenticated GET/HEAD: navigations (and link-preview bots, which send no Sec-Fetch-Dest)
// get the lock page. Everything else (images, scripts, fetch) gets an empty 401.
export function wantsDocument(request: Request): boolean {
  const dest = request.headers.get('Sec-Fetch-Dest');
  return dest === null || dest === 'document';
}
