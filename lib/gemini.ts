import { GoogleGenAI } from "@google/genai";

export const DEFAULT_MESSAGE =
  "เรื่องนี้น้องลูกแก้วไม่สามารถตอบได้ เดี๋ยวรอพ่อหมอมาตอบเองนะครับ/คะ";

const MODEL = "gemini-3.5-flash";

const SYSTEM_PROMPT = `<role>
คุณคือ "น้องลูกแก้ว" AI ผู้ช่วยสุดน่ารักของ "พ่อหมอรอลงเวร" มีหน้าที่คอยช่วยจัดคิวและตอบคำถามลูกดวงเบื้องต้น
</role>
<constraints>
- ตอบคำถามโดยอ้างอิงข้อมูลจาก <faq> เท่านั้น
- ห้ามแต่งเติมข้อมูล ราคา, เวลา, สถานที่ หรือคิวว่างเองเด็ดขาด
- โทนภาษา: สุภาพ ทางการ สั้นและกระชับ
- ความยาวของการตอบ: 1-3 ประโยคเท่านั้น
- หากลูกค้าถามเรื่องที่ไม่มีใน <faq> หรืออยู่นอกเหนือความสามารถ ให้ตอบด้วยข้อความนี้เท่านั้น: "${DEFAULT_MESSAGE}"
</constraints>
<output_format>
ตอบกลับเป็นภาษาไทย และไม่ใช้ Markdown Formatting (เช่น **, *, #) ในข้อความ
</output_format>
<faq>
{{FAQ_DATA}}
</faq>
<question>
{{USER_MESSAGE}}
</question>`;

export function buildPrompt(faqData: string, userMessage: string): string {
  // ใช้ function replacer เพื่อไม่ให้ "$&" ฯลฯ ในข้อมูลถูกตีความเป็น pattern
  return SYSTEM_PROMPT.replace("{{FAQ_DATA}}", () => faqData).replace(
    "{{USER_MESSAGE}}",
    () => userMessage,
  );
}

export type GeminiResult = {
  text: string;
  finishReason: string | undefined;
  thoughtsTokenCount: number | undefined;
  candidatesTokenCount: number | undefined;
};

export async function askGemini(
  faqData: string,
  userMessage: string,
  timeoutMs: number,
): Promise<GeminiResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: buildPrompt(faqData, userMessage),
    config: {
      temperature: 1.0,
      maxOutputTokens: 1024,
      // ตัดที่ฝั่งเรา ไม่ใช้ httpOptions.timeout เพราะ Gemini API ปฏิเสธ deadline สั้นกว่า ~10s
      abortSignal: AbortSignal.timeout(timeoutMs),
    },
  });

  return {
    text: (response.text ?? "").trim(),
    finishReason: response.candidates?.[0]?.finishReason,
    thoughtsTokenCount: response.usageMetadata?.thoughtsTokenCount,
    candidatesTokenCount: response.usageMetadata?.candidatesTokenCount,
  };
}
