
import Groq from "groq-sdk";
import { NextResponse } from "next/server";

export const maxDuration = 30;

type QuizQuestion = {
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
};

type QuizResponse = {
  questions: QuizQuestion[];
};

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

    const { notes } = await request.json();

    if (typeof notes !== "string" || !notes.trim()) {
      return NextResponse.json(
        { error: "Upload a readable PDF first." },
        { status: 400 }
      );
    }

    const shortenedNotes = notes.slice(0, 6000);
    const groq = new Groq({ apiKey });

    console.log(
      `[Ruby Quiz] Started. Notes: ${notes.length}; sent: ${shortenedNotes.length}.`
    );

    const result = await groq.chat.completions.create({
      model: "openai/gpt-oss-20b",
      messages: [
        {
          role: "system",
          content:
            "You generate accurate study quizzes. Follow the requested JSON structure exactly. Use only the supplied lecture notes.",
        },
        {
          role: "user",
          content: `Create exactly 5 multiple-choice questions based only on these notes.

Return JSON in this format:
{
  "questions": [
    {
      "question": "Question text",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": 0,
      "explanation": "One short sentence"
    }
  ]
}

Rules:
- Exactly 5 questions.
- Exactly 4 options per question.
- correctAnswer must be an integer from 0 to 3.
- Make questions useful for exam preparation.
- Keep explanations to one short sentence.
- Return valid JSON only.

LECTURE NOTES:
${shortenedNotes}`,
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 2500,
      temperature: 0.2,
    });

    const text = result.choices[0]?.message?.content?.trim();

    if (!text) {
      console.error("[Ruby Quiz] Groq returned an empty response.");

      return NextResponse.json(
        { error: "Ruby received an empty response. Please try again." },
        { status: 502 }
      );
    }

    let quiz: QuizResponse;

    try {
      quiz = JSON.parse(text) as QuizResponse;
    } catch {
      console.error("[Ruby Quiz] Invalid JSON:", text);

      return NextResponse.json(
        { error: "Ruby received an invalid quiz. Please try again." },
        { status: 502 }
      );
    }

    const validQuiz =
      Array.isArray(quiz.questions) &&
      quiz.questions.length === 5 &&
      quiz.questions.every(
        (q) =>
          typeof q.question === "string" &&
          q.question.trim().length > 0 &&
          Array.isArray(q.options) &&
          q.options.length === 4 &&
          q.options.every(
            (option) =>
              typeof option === "string" && option.trim().length > 0
          ) &&
          Number.isInteger(q.correctAnswer) &&
          q.correctAnswer >= 0 &&
          q.correctAnswer <= 3 &&
          typeof q.explanation === "string"
      );

    if (!validQuiz) {
      console.error("[Ruby Quiz] Invalid quiz structure:", text);

      return NextResponse.json(
        { error: "Ruby generated an invalid quiz. Please try again." },
        { status: 502 }
      );
    }

    console.log(
      `[Ruby Quiz] Completed in ${Date.now() - startTime} ms.`
    );

    return NextResponse.json(quiz, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[Ruby Quiz] Request failed:", error);

    const status =
      typeof error === "object" &&
      error !== null &&
      "status" in error
        ? (error as { status?: number }).status
        : undefined;

    if (status === 429 || status === 503) {
      return NextResponse.json(
        {
          error:
            "Ruby's AI service is busy or has reached its free usage limit. Please try again later.",
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: "Ruby could not generate the quiz. Please try again." },
      { status: 500 }
    );
  }
}
