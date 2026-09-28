// The one-time arrival signal (technical spec §6.3): the verify endpoints set __Host-auth-arrival,
// and the first gated HTML response turns it into <html data-arrival="unlock"> and expires it.
import { wantsDocument } from './classify.ts';

export type HtmlAttributes = Record<string, string>;

/** `<html>` attributes for an arrival cookie value. Unknown values add nothing. */
export function arrivalAttributes(value: string | null): HtmlAttributes {
  if (value === 'lock') return { 'data-arrival': 'unlock' };
  if (value === 'invite')
    return { 'data-arrival': 'unlock', 'data-arrival-from': 'invite' };
  return {};
}

export interface ArrivalDecision {
  attributes: HtmlAttributes;
  /** Whether this response should expire the arrival cookie. */
  expire: boolean;
}

/**
 * Whether this gated response should consume the arrival cookie: only a GET document request
 * (the one that actually renders the destination page for a person to see the bloom on).
 * A HEAD or a non-document request (an image, a script, a background fetch) leaves the cookie
 * alone so the real next document view still gets the arrival attributes.
 */
export function arrivalDecision(
  request: Request,
  cookieValue: string | null,
): ArrivalDecision {
  if (
    cookieValue === null ||
    request.method !== 'GET' ||
    !wantsDocument(request)
  ) {
    return { attributes: {}, expire: false };
  }
  return { attributes: arrivalAttributes(cookieValue), expire: true };
}
