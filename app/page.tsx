
"use client";

import { useRef, useState } from "react";
import { extractPdfText } from "./lib/pdf-reader";

type QuizQuestion = {
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
};

type QuizAttempt = {
  id: number;
  fileName: string;
  score: number;
  total: number;
  date: string;
};

function loadQuizHistory(): QuizAttempt[] {
  try {
    if (typeof window === "undefined") return [];

    const saved = localStorage.getItem("rubyQuizHistory");
    if (!saved) return [];

    const parsed: unknown = JSON.parse(saved);

    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (item): item is QuizAttempt =>
        item !== null &&
        typeof item === "object" &&
        typeof item.id === "number" &&
        typeof item.fileName === "string" &&
        typeof item.score === "number" &&
        typeof item.total === "number" &&
        typeof item.date === "string"
    );
  } catch {
    return [];
  }
}

export default function Home() {
  const fileInput = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState("");
  const [pdfText, setPdfText] = useState("");
  const [isReading, setIsReading] = useState(false);
  const [error, setError] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [isAsking, setIsAsking] = useState(false);

  const [quiz, setQuiz] = useState<QuizQuestion[]>([]);
  const [selectedAnswers, setSelectedAnswers] = useState<number[]>([]);
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [isGeneratingQuiz, setIsGeneratingQuiz] = useState(false);
  const [quizError, setQuizError] = useState("");

  const [quizHistory, setQuizHistory] = useState<QuizAttempt[]>(
    loadQuizHistory
  );

  async function handleFile(file?: File) {
    if (!file) return;

    setError("");
    setQuizError("");
    setAnswer("");
    setPdfText("");
    setFileName("");
    setQuiz([]);
    setSelectedAnswers([]);
    setQuizSubmitted(false);

    if (file.type !== "application/pdf") {
      setError("Please select a PDF document.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError("Please choose a PDF smaller than 5 MB.");
      return;
    }

    setIsReading(true);

    try {
      const text = await extractPdfText(file);

      if (!text.trim()) {
        throw new Error("No readable text was found in this PDF.");
      }

      setFileName(file.name);
      setPdfText(text);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not read this PDF."
      );
    } finally {
      setIsReading(false);
    }
  }

  async function askRuby(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!pdfText || !question.trim()) {
      setError("Upload a readable PDF and enter a question.");
      return;
    }

    setError("");
    setAnswer("");
    setIsAsking(true);

    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: question.trim(),
          notes: pdfText,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Ruby could not answer.");
      }

      if (!response.body) {
        throw new Error("Ruby returned no response.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        setAnswer((previous) =>
          previous + decoder.decode(value, { stream: true })
        );
      }

      const remaining = decoder.decode();

      if (remaining) {
        setAnswer((previous) => previous + remaining);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong."
      );
    } finally {
      setIsAsking(false);
    }
  }

  async function generateQuiz() {
    if (!pdfText) {
      setQuizError("Upload a readable PDF first.");
      return;
    }

    setQuizError("");
    setQuiz([]);
    setSelectedAnswers([]);
    setQuizSubmitted(false);
    setIsGeneratingQuiz(true);

    try {
      const response = await fetch("/api/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: pdfText }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not generate the quiz.");
      }

      if (!Array.isArray(data.questions) || data.questions.length !== 5) {
        throw new Error("Ruby returned an invalid quiz. Please try again.");
      }

      setQuiz(data.questions as QuizQuestion[]);
      setSelectedAnswers(Array(5).fill(-1));
    } catch (err) {
      setQuizError(
        err instanceof Error
          ? err.message
          : "Something went wrong generating the quiz."
      );
    } finally {
      setIsGeneratingQuiz(false);
    }
  }

  function submitQuiz() {
    if (selectedAnswers.some((selected) => selected === -1)) {
      setQuizError("Please answer all 5 questions before submitting.");
      return;
    }

    if (quizSubmitted || quiz.length === 0) return;

    const finalScore = quiz.reduce(
      (total, item, index) =>
        total +
        (selectedAnswers[index] === item.correctAnswer ? 1 : 0),
      0
    );

    const attempt: QuizAttempt = {
      id: Date.now(),
      fileName: fileName || "Lecture notes",
      score: finalScore,
      total: quiz.length,
      date: new Date().toLocaleString(),
    };

    const updatedHistory = [attempt, ...quizHistory].slice(0, 20);

    setQuizHistory(updatedHistory);
    setQuizError("");
    setQuizSubmitted(true);

    try {
      localStorage.setItem(
        "rubyQuizHistory",
        JSON.stringify(updatedHistory)
      );
    } catch {
      setQuizError(
        "Your quiz was scored, but Ruby could not save the history in this browser."
      );
    }
  }

  function retryQuiz() {
    setSelectedAnswers(Array(quiz.length).fill(-1));
    setQuizSubmitted(false);
    setQuizError("");
  }

  function clearHistory() {
    try {
      localStorage.removeItem("rubyQuizHistory");
      setQuizHistory([]);
      setQuizError("");
    } catch {
      setQuizError("Could not clear saved history.");
    }
  }

  const score = quiz.reduce(
    (total, item, index) =>
      total + (selectedAnswers[index] === item.correctAnswer ? 1 : 0),
    0
  );

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <aside className="fixed hidden h-screen w-64 flex-col border-r border-slate-200 bg-white p-6 md:flex">
        <h1 className="text-3xl font-bold text-violet-700">
          Ruby<span className="text-pink-500">.</span>
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Your AI study companion
        </p>

        <nav className="mt-10 space-y-2">
          <a href="#dashboard" className="block rounded-xl bg-violet-50 px-4 py-3 font-semibold text-violet-700">
            ⌂ Dashboard
          </a>
          <a href="#documents" className="block rounded-xl px-4 py-3 text-slate-600 hover:bg-slate-50">
            ▤ My Documents
          </a>
          <a href="#ask-ruby" className="block rounded-xl px-4 py-3 text-slate-600 hover:bg-slate-50">
            ✧ AI Study Assistant
          </a>
          <a href="#quizzes" className="block rounded-xl px-4 py-3 text-slate-600 hover:bg-slate-50">
            ✓ Practice Quizzes
          </a>
          <a href="#study-history" className="block rounded-xl px-4 py-3 text-slate-600 hover:bg-slate-50">
            ◷ Study History
          </a>
        </nav>

        <div className="mt-auto rounded-2xl bg-violet-50 p-4">
          <p className="font-semibold text-violet-800">Study smarter.</p>
          <p className="mt-1 text-sm text-slate-600">
            Upload your notes and start learning.
          </p>
        </div>
      </aside>

      <section id="dashboard" className="px-5 py-8 md:ml-64 md:px-10">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm text-slate-500">YOUR LEARNING SPACE</p>
            <h2 className="mt-1 text-3xl font-bold">Welcome to Ruby 👋</h2>
            <p className="mt-2 text-slate-500">
              Ready to make progress today?
            </p>
          </div>
          <div className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm">
            🎓 Student workspace
          </div>
        </header>

        <section className="mt-8 rounded-3xl bg-linear-to-r from-violet-700 to-indigo-600 p-7 text-white shadow-lg md:p-10">
          <p className="text-sm font-semibold uppercase tracking-widest text-violet-200">
            Your personal study partner
          </p>
          <h3 className="mt-3 max-w-xl text-3xl font-bold md:text-4xl">
            Understand more. Remember more. Achieve more.
          </h3>
          <p className="mt-3 max-w-xl text-violet-100">
            Bring your lecture notes and turn them into a more effective study experience.
          </p>

          <button
            onClick={() => fileInput.current?.click()}
            disabled={isReading}
            className="mt-6 rounded-xl bg-white px-5 py-3 font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-60"
          >
            {isReading ? "Reading PDF..." : "+ Upload lecture notes"}
          </button>

          <input
            ref={fileInput}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={(e) => {
              handleFile(e.target.files?.[0]);
              e.currentTarget.value = "";
            }}
          />

          {isReading && <p className="mt-3 text-sm">Reading your notes...</p>}

          {fileName && (
            <p className="mt-3 text-sm">✓ Read successfully: {fileName}</p>
          )}

          {error && (
            <p role="alert" className="mt-3 text-sm text-red-100">{error}</p>
          )}

          <p className="mt-3 text-xs text-violet-200">
            PDF only · Maximum 5 MB
          </p>
        </section>

        <section id="documents" className="mt-9 rounded-2xl border border-slate-200 bg-white p-6">
          <h3 className="text-xl font-bold">My Documents</h3>
          {fileName ? (
            <div className="mt-4 rounded-xl bg-slate-50 p-4">
              <p className="font-semibold">📄 {fileName}</p>
              <p className="mt-1 text-sm text-slate-500">
                {pdfText.length.toLocaleString()} characters extracted and ready to study.
              </p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-500">
              Upload a PDF above to get started.
            </p>
          )}
        </section>

        <section id="ask-ruby" className="mt-9 rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-100 text-2xl">✧</div>
            <div>
              <h3 className="text-xl font-bold">Ask Ruby</h3>
              <p className="text-sm text-slate-500">Ask questions about your uploaded lecture notes.</p>
            </div>
          </div>

          <form onSubmit={askRuby} className="mt-5 space-y-3">
            <label htmlFor="question" className="block text-sm font-medium">Your question</label>
            <textarea
              id="question"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="For example: Explain the main ideas in these notes..."
              rows={3}
              className="w-full rounded-xl border border-slate-200 p-4 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
              required
            />
            <button
              type="submit"
              disabled={isAsking || !pdfText || !question.trim()}
              className="rounded-xl bg-violet-700 px-5 py-3 font-semibold text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isAsking ? "Ruby is thinking..." : "Ask Ruby"}
            </button>
            {!pdfText && <p className="text-sm text-slate-500">Upload a readable PDF first to enable questions.</p>}
          </form>

          {(answer || isAsking) && (
            <div className="mt-6 rounded-xl bg-violet-50 p-5">
              <h4 className="font-bold text-violet-900">Ruby&apos;s answer</h4>
              <div className="mt-3 whitespace-pre-wrap leading-7 text-slate-700">
                {answer || "Waiting for Ruby's response..."}
              </div>
            </div>
          )}
        </section>

        <section id="quizzes" className="mt-9 rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-xl font-bold">Practice Quizzes</h3>
              <p className="mt-2 text-sm text-slate-500">Test your understanding with 5 questions based on your notes.</p>
            </div>
            <button
              type="button"
              onClick={generateQuiz}
              disabled={!pdfText || isGeneratingQuiz}
              className="rounded-xl bg-violet-700 px-5 py-3 font-semibold text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isGeneratingQuiz ? "Generating quiz..." : quiz.length > 0 ? "Generate New Quiz" : "Generate Quiz"}
            </button>
          </div>

          {!pdfText && <p className="mt-4 text-sm text-slate-500">Upload a readable PDF first to generate a quiz.</p>}
          {isGeneratingQuiz && <p className="mt-4 text-sm text-violet-700">Ruby is preparing your questions. This may take a little while.</p>}

          {quizError && (
            <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{quizError}</p>
          )}

          {quiz.length > 0 && (
            <div className="mt-6 space-y-6">
              {quizSubmitted && (
                <div className="rounded-2xl bg-violet-50 p-5">
                  <h4 className="text-lg font-bold text-violet-900">Quiz complete!</h4>
                  <p className="mt-2 text-violet-800">
                    Your score: {score} out of {quiz.length} ({Math.round((score / quiz.length) * 100)}%)
                  </p>
                  <p className="mt-1 text-sm text-violet-700">
                    {score === quiz.length
                      ? "Excellent work! You got every question correct."
                      : score >= 3
                        ? "Good work! Review the explanations to improve further."
                        : "Keep practising! Review the explanations and try again."}
                  </p>
                </div>
              )}

              {quiz.map((item, questionIndex) => (
                <div key={`${questionIndex}-${item.question}`} className="rounded-xl border border-slate-200 p-5">
                  <h4 className="font-semibold">{questionIndex + 1}. {item.question}</h4>
                  <div className="mt-4 space-y-3">
                    {item.options.map((option, optionIndex) => {
                      const selected = selectedAnswers[questionIndex] === optionIndex;
                      const correct = quizSubmitted && item.correctAnswer === optionIndex;
                      const incorrect = quizSubmitted && selected && item.correctAnswer !== optionIndex;

                      return (
                        <label
                          key={optionIndex}
                          className={`flex items-start gap-3 rounded-xl border p-3 ${
                            correct
                              ? "border-green-500 bg-green-50"
                              : incorrect
                                ? "border-red-400 bg-red-50"
                                : selected
                                  ? "border-violet-500 bg-violet-50"
                                  : "border-slate-200"
                          } ${quizSubmitted ? "cursor-default" : "cursor-pointer hover:border-violet-300"}`}
                        >
                          <input
                            type="radio"
                            name={`question-${questionIndex}`}
                            checked={selected}
                            disabled={quizSubmitted}
                            onChange={() => {
                              setSelectedAnswers((previous) =>
                                previous.map((value, index) => index === questionIndex ? optionIndex : value)
                              );
                            }}
                            className="mt-1 accent-violet-700"
                          />
                          <span className="text-sm">{option}</span>
                          {correct && <span className="ml-auto text-sm font-semibold text-green-700">Correct</span>}
                        </label>
                      );
                    })}
                  </div>

                  {quizSubmitted && (
                    <div className="mt-4 rounded-lg bg-slate-50 p-4 text-sm">
                      <p className={`font-semibold ${selectedAnswers[questionIndex] === item.correctAnswer ? "text-green-700" : "text-red-700"}`}>
                        {selectedAnswers[questionIndex] === item.correctAnswer
                          ? "Your answer is correct."
                          : `Correct answer: ${item.options[item.correctAnswer]}`}
                      </p>
                      <p className="mt-2 leading-6 text-slate-600">{item.explanation}</p>
                    </div>
                  )}
                </div>
              ))}

              {!quizSubmitted ? (
                <button
                  type="button"
                  onClick={submitQuiz}
                  className="rounded-xl bg-violet-700 px-5 py-3 font-semibold text-white hover:bg-violet-800"
                >
                  Submit Answers
                </button>
              ) : (
                <button
                  type="button"
                  onClick={retryQuiz}
                  className="rounded-xl border border-violet-700 px-5 py-3 font-semibold text-violet-700 hover:bg-violet-50"
                >
                  Retry Quiz
                </button>
              )}
            </div>
          )}
        </section>

        <section id="study-history" className="mt-9 rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-xl font-bold">Study History</h3>
              <p className="mt-2 text-sm text-slate-500">Track your recent quiz results.</p>
            </div>
            <span className="rounded-full bg-violet-50 px-3 py-1 text-sm font-semibold text-violet-700">
              {quizHistory.length} attempts
            </span>
          </div>

          {quizHistory.length === 0 ? (
            <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
              No quiz attempts yet. Complete your first quiz and your results will appear here.
            </p>
          ) : (
            <div className="mt-5 space-y-3">
              {quizHistory.map((attempt) => (
                <div key={attempt.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4">
                  <div>
                    <p className="font-semibold">📄 {attempt.fileName}</p>
                    <p className="mt-1 text-xs text-slate-500">{attempt.date}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-violet-700">{attempt.score}/{attempt.total}</p>
                    <p className="text-sm text-slate-500">
                      {Math.round((attempt.score / attempt.total) * 100)}%
                    </p>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={clearHistory}
                className="mt-2 text-sm font-medium text-red-600 hover:text-red-700"
              >
                Clear history
              </button>
            </div>
          )}
        </section>

        {pdfText && (
          <section className="mt-9 rounded-2xl border border-slate-200 bg-white p-6">
            <h3 className="text-xl font-bold">Extracted lecture notes</h3>
            <p className="mt-2 text-sm text-slate-500">{pdfText.length.toLocaleString()} characters extracted.</p>
            <pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap wrap-break-words rounded-xl bg-slate-50 p-4 text-sm">{pdfText}</pre>
          </section>
        )}

        <footer className="mt-10 pb-4 text-center text-sm text-slate-400">
          Ruby · Your learning journey, one step at a time.
        </footer>
      </section>
    </main>
  );
}
