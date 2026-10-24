
import Groq from "groq-sdk";
import { NextResponse } from "next/server";

export const maxDuration = 30;

export async function POST(request: Request) {
  const startTime = Date.now();

  try {
    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Groq API key is missing. Check .env.local." },
        { status: 500 }
      );
    }

    const { question, notes } = await request.json();

    if (
      typeof question !== "string" ||
      typeof notes !== "string" ||
      !question.trim() ||
      !notes.trim()
    ) {
      return NextResponse.json(
        { error: "Upload notes and enter a question." },
        { status: 400 }
      );
    }

    const shortenedNotes = notes.slice(0, 6000);
    const groq = new Groq({ apiKey });

    console.log(
      `[Ask Ruby] Started. Notes: ${notes.length}; sent: ${shortenedNotes.length}.`
    );

    const result = await groq.chat.completions.create({
      model: "openai/gpt-oss-20b",
      messages: [
        {
          role: "system",
          content:
            "You are Ruby, a friendly study tutor. Explain concepts in simple, beginner-friendly language. Answer directly and concisely. Use the supplied lecture notes as your main source. If the answer is not covered in the notes, say so. Do not invent facts.",
        },
        {
          role: "user",
          content: `LECTURE NOTES:\n${shortenedNotes}\n\nQUESTION:\n${question.trim()}`,
        },
      ],
      max_tokens: 700,
      temperature: 0.3,
      stream: true,
    });

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of result) {
            const content = chunk.choices[0]?.delta?.content;

            if (typeof content === "string" && content.length > 0) {
              controller.enqueue(encoder.encode(content));
            }
          }

          console.log(
            `[Ask Ruby] Completed in ${Date.now() - startTime} ms.`
          );

          controller.close();
        } catch (error) {
          console.error("[Ask Ruby] Stream error:", error);
          controller.error(error);
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
      },
    });
  } catch (error) {
    console.error("[Ask Ruby] Request failed:", error);

    return NextResponse.json(
      { error: "Ruby could not answer. Please try again." },
      { status: 500 }
    );
  }
}
