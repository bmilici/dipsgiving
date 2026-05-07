import { createSign } from "crypto";
import { readFileSync } from "fs";
import path from "path";
import { NextRequest } from "next/server";

export const runtime = "nodejs";

type ServiceAccount = {
  client_email: string;
  private_key: string;
  token_uri?: string;
};

type AccessToken = {
  token: string;
  expiresAt: number;
};

let cachedAccessToken: AccessToken | null = null;

function base64Url(input: string | Buffer) {
  return Buffer.from(input).toString("base64url");
}

function getServiceAccount() {
  const inlineCredentials = process.env.GOOGLE_TTS_CREDENTIALS_JSON;
  if (inlineCredentials) {
    const json = inlineCredentials.trim().startsWith("{")
      ? inlineCredentials
      : Buffer.from(inlineCredentials, "base64").toString("utf8");
    return JSON.parse(json) as ServiceAccount;
  }

  const credentialsPath =
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    path.join(process.cwd(), "secrets", "games-text-to-speech-key.json");

  return JSON.parse(readFileSync(credentialsPath, "utf8")) as ServiceAccount;
}

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cachedAccessToken && cachedAccessToken.expiresAt - 60 > now) {
    return cachedAccessToken.token;
  }

  const serviceAccount = getServiceAccount();
  const tokenUri = serviceAccount.token_uri || "https://oauth2.googleapis.com/token";
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(
    JSON.stringify({
      iss: serviceAccount.client_email,
      scope: "https://www.googleapis.com/auth/cloud-platform",
      aud: tokenUri,
      exp: now + 3600,
      iat: now,
    }),
  );
  const unsignedJwt = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsignedJwt);
  signer.end();
  const signature = signer.sign(serviceAccount.private_key, "base64url");
  const assertion = `${unsignedJwt}.${signature}`;

  const response = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!response.ok) {
    throw new Error(`Google auth failed: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };
  cachedAccessToken = {
    token: data.access_token,
    expiresAt: now + data.expires_in,
  };

  return cachedAccessToken.token;
}

export async function GET(request: NextRequest) {
  const letter = (request.nextUrl.searchParams.get("letter") || "").trim().toUpperCase();
  if (!/^[A-Z]$/.test(letter)) {
    return Response.json({ error: "A single A-Z letter is required." }, { status: 400 });
  }

  try {
    const accessToken = await getAccessToken();
    const response = await fetch("https://texttospeech.googleapis.com/v1/text:synthesize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: {
          prompt: "Say this in a cheerful, clear voice for a young child learning letters.",
          text: `Find the letter ${letter}`,
        },
        voice: {
          languageCode: process.env.GOOGLE_TTS_LANGUAGE_CODE || "en-US",
          name: process.env.GOOGLE_TTS_VOICE_NAME || "Aoede",
          modelName: process.env.GOOGLE_TTS_MODEL_NAME || "gemini-2.5-flash-tts",
        },
        audioConfig: {
          audioEncoding: "MP3",
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Google Text-to-Speech failed: ${response.status} ${await response.text()}`);
    }

    const data = (await response.json()) as { audioContent: string };
    const audio = Buffer.from(data.audioContent, "base64");

    return new Response(audio, {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Type": "audio/mpeg",
      },
    });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Text-to-speech failed." }, { status: 500 });
  }
}
