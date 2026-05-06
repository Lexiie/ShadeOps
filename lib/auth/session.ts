import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";

const CHALLENGE_COOKIE = "shadeops_challenge";
const SESSION_COOKIE = "shadeops_session";
const SESSION_TTL_SECONDS = 60 * 60 * 8;
const CHALLENGE_TTL_SECONDS = 60 * 5;

type SessionPayload = {
  walletAddress: string;
  issuedAt: number;
  expiresAt: number;
};

/**
 * Creates a wallet sign-in challenge and stores the nonce in an httpOnly cookie.
 */
export async function createWalletChallenge(walletAddress: string): Promise<{ message: string; expiresAt: string }> {
  const publicKey = new PublicKey(walletAddress).toBase58();
  const nonce = randomBytes(16).toString("hex");
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + CHALLENGE_TTL_SECONDS * 1000);
  const message = [
    "ShadeOps wallet sign-in",
    `Wallet: ${publicKey}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt.toISOString()}`,
    "Purpose: authorize workspace dashboard and payout configuration APIs."
  ].join("\n");

  const cookieStore = await cookies();
  cookieStore.set(CHALLENGE_COOKIE, signPayload({ walletAddress: publicKey, nonce, message, expiresAt: expiresAt.toISOString() }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: CHALLENGE_TTL_SECONDS
  });

  return { message, expiresAt: expiresAt.toISOString() };
}

/**
 * Verifies a signed wallet challenge and stores a short-lived session cookie.
 */
export async function verifyWalletChallenge(walletAddress: string, signature: string): Promise<SessionPayload> {
  const publicKey = new PublicKey(walletAddress);
  const cookieStore = await cookies();
  const challenge = readSignedPayload<{ walletAddress: string; nonce: string; message: string; expiresAt: string }>(cookieStore.get(CHALLENGE_COOKIE)?.value);

  if (!challenge) {
    throw new Error("Wallet challenge is missing or invalid.");
  }

  if (challenge.walletAddress !== publicKey.toBase58()) {
    throw new Error("Wallet challenge does not match the connected wallet.");
  }

  if (Date.parse(challenge.expiresAt) <= Date.now()) {
    throw new Error("Wallet challenge expired. Request a new challenge.");
  }

  const messageBytes = new TextEncoder().encode(challenge.message);
  const signatureBytes = bs58.decode(signature);

  if (!nacl.sign.detached.verify(messageBytes, signatureBytes, publicKey.toBytes())) {
    throw new Error("Wallet signature verification failed.");
  }

  const session: SessionPayload = {
    walletAddress: publicKey.toBase58(),
    issuedAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000
  };

  cookieStore.set(SESSION_COOKIE, signPayload(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS
  });
  cookieStore.delete(CHALLENGE_COOKIE);

  return session;
}

/**
 * Returns the active wallet session, if present and valid.
 */
export async function getWalletSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const session = readSignedPayload<SessionPayload>(cookieStore.get(SESSION_COOKIE)?.value);

  if (!session || session.expiresAt <= Date.now()) {
    return null;
  }

  return session;
}

/**
 * Requires an authenticated wallet session for protected APIs.
 */
export async function requireWalletSession(): Promise<SessionPayload> {
  const session = await getWalletSession();

  if (!session) {
    throw new Error("Connect and sign with an admin wallet before accessing this API.");
  }

  return session;
}

/**
 * Clears wallet auth cookies.
 */
export async function clearWalletSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  cookieStore.delete(CHALLENGE_COOKIE);
}

function signPayload(payload: unknown): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", getSessionSecret()).update(encoded).digest("base64url");

  return `${encoded}.${signature}`;
}

function readSignedPayload<T>(value: string | undefined): T | null {
  if (!value) {
    return null;
  }

  const [encoded, signature] = value.split(".");

  if (!encoded || !signature) {
    return null;
  }

  const expectedSignature = createHmac("sha256", getSessionSecret()).update(encoded).digest("base64url");
  const expected = Buffer.from(expectedSignature);
  const actual = Buffer.from(signature);

  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }

  return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as T;
}

function getSessionSecret(): string {
  const secret = process.env.SHADEOPS_SESSION_SECRET;

  if (process.env.NODE_ENV === "production" && (!secret || secret === "shadeops-dev-session-secret-change-before-production")) {
    throw new Error("SHADEOPS_SESSION_SECRET must be set to a strong unique value in production.");
  }

  return secret ?? "shadeops-dev-session-secret-change-before-production";
}
