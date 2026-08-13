import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "GROQ_API_KEY is missing from environment." },
        { status: 500 },
      );
    }

    const { message, habits } = await req.json();

    const habitsContext =
      habits && habits.length > 0
        ? habits
            .map(
              (h: any) =>
                `- ${h.title}: ${h.is_completed ? "Completed ✅" : "Not completed yet ⏳"}`,
            )
            .join("\n")
        : "No habits added yet.";

    const systemInstruction = `You are James Clear, an elite behavior coach and author of "Atomic Habits".
Your mission is to guide the user in building small, effective systems, maintaining consistency, and breaking bad habits.
Be concise, practical, direct, and empathetic. Focus on identity-based habits and systems over willpower.

Here is the user's current live habit progress for today:
${habitsContext}

Use this context naturally when appropriate to hold them accountable. Keep responses crisp and easy to digest.`;

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: message },
        ],
        temperature: 0.7,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("Groq API Error:", data);
      return NextResponse.json(
        { error: data.error?.message || "Groq API Error" },
        { status: res.status },
      );
    }

    const reply =
      data.choices?.[0]?.message?.content || "No response generated.";
    return NextResponse.json({ reply });
  } catch (error: any) {
    console.error("API Handler Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal Server Error" },
      { status: 500 },
    );
  }
}
