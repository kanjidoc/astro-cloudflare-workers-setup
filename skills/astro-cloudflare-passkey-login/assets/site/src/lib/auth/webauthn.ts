// Thin wrappers around SimpleWebAuthn v14 with the fixed settings from technical spec §5.1.
// Signatures checked against @simplewebauthn/server@14.0.3's esm/*.d.ts.
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
  type VerifiedAuthenticationResponse,
  type VerifiedRegistrationResponse,
} from '@simplewebauthn/server';
import type { AuthConfig } from './config.ts';
import { b64url } from './encoding.ts';
import type { CredentialRecord, UserRecord } from './store.ts';

/** Ed25519, ES256, RS256. Pinned: v14 otherwise prefers ML-DSA when the runtime supports it. */
export const SUPPORTED_ALGORITHM_IDS = [-8, -7, -257];
export const CEREMONY_TIMEOUT_MS = 120_000;

type RP = Pick<AuthConfig, 'rpID' | 'rpName' | 'origin'>;

export function authOptions(
  cfg: RP,
): Promise<PublicKeyCredentialRequestOptionsJSON> {
  return generateAuthenticationOptions({
    rpID: cfg.rpID,
    allowCredentials: [],
    userVerification: 'required',
    timeout: CEREMONY_TIMEOUT_MS,
  });
}

export function verifyAuth(
  cfg: RP,
  response: AuthenticationResponseJSON,
  expectedChallenge: string,
  cred: CredentialRecord,
): Promise<VerifiedAuthenticationResponse> {
  return verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: cfg.origin,
    expectedRPID: cfg.rpID,
    credential: {
      id: response.id,
      publicKey: b64url.decode(cred.publicKey),
      counter: cred.counter,
      transports: cred.transports,
    },
    requireUserVerification: true,
  });
}

export function regOptions(
  cfg: RP,
  user: UserRecord,
): Promise<PublicKeyCredentialCreationOptionsJSON> {
  return generateRegistrationOptions({
    rpName: cfg.rpName,
    rpID: cfg.rpID,
    userName: user.name,
    userDisplayName: user.name,
    userID: b64url.decode(user.webauthnUserID),
    attestationType: 'none',
    authenticatorSelection: {
      residentKey: 'required',
      userVerification: 'required',
    },
    supportedAlgorithmIDs: SUPPORTED_ALGORITHM_IDS,
    timeout: CEREMONY_TIMEOUT_MS,
  });
}

export function verifyReg(
  cfg: RP,
  response: RegistrationResponseJSON,
  expectedChallenge: string,
): Promise<VerifiedRegistrationResponse> {
  return verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: cfg.origin,
    expectedRPID: cfg.rpID,
    requireUserVerification: true,
    supportedAlgorithmIDs: SUPPORTED_ALGORITHM_IDS,
  });
}
