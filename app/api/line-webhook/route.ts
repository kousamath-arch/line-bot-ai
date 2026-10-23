import { messagingApi, validateSignature, type webhook } from "@line/bot-sdk";
import { NextResponse } from "next/server";
import { askGemini, DEFAULT_MESSAGE } from "@/lib/gemini";
import { formatFaq, getFaq } from "@/lib/sheet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

// งบเวลารวมก่อน reply ไม่เกิน 10 วินาที (เหลือ margin ให้ LINE reply)
const GEMINI_TIMEOUT_MS = 6_000;

async function buildAnswer(userMessage: string): Promise<string> {
  let faqData: string;
  try {
    faqData = formatFaq(await getFaq());
  } catch (err) {
    console.error("[sheet] fetch failed:", err);
    return DEFAULT_MESSAGE;
  }

  try {
    const result = await askGemini(faqData, userMessage, GEMINI_TIMEOUT_MS);
    console.log("[gemini]", {
      finishReason: result.finishReason,
      thoughtsTokenCount: result.thoughtsTokenCount,
      candidatesTokenCount: result.candidatesTokenCount,
    });

    if (result.finishReason === "MAX_TOKENS") return DEFAULT_MESSAGE;
    return result.text || DEFAULT_MESSAGE;
  } catch (err) {
    console.error("[gemini] call failed:", err);
    return DEFAULT_MESSAGE;
  }
}

async function handleEvent(
  client: messagingApi.MessagingApiClient,
  event: webhook.Event,
) {
  if (event.type !== "message" || event.message.type !== "text") return;
  const replyToken = event.replyToken;
  if (!replyToken) return;

  const answer = await buildAnswer(event.message.text);
  try {
    await client.replyMessage({
      replyToken,
      messages: [{ type: "text", text: answer }],
    });
  } catch (err) {
    console.error("[line] reply failed:", err);
  }
}

export async function POST(req: Request) {
  const channelSecret = process.env.LINE_CHANNEL_SECRET;
  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!channelSecret || !channelAccessToken) {
    console.error("LINE_CHANNEL_SECRET / LINE_CHANNEL_ACCESS_TOKEN is not set");
    return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
  }

  const body = await req.text();
  const signature = req.headers.get("x-line-signature");
  if (!signature || !validateSignature(body, channelSecret, signature)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let events: webhook.Event[];
  try {
    events = JSON.parse(body).events ?? [];
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const client = new messagingApi.MessagingApiClient({ channelAccessToken });
  await Promise.all(events.map((e) => handleEvent(client, e)));

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ status: "ok" });
}
