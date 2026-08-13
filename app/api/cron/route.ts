export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const resend = new Resend(process.env.RESEND_API_KEY);

export async function GET(req: Request) {
  try {
    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from("profiles")
      .select("*");

    console.log("--- CRON DEBUG LOG ---");
    console.log("Profiles found in database:", profiles);

    if (profilesError || !profiles || profiles.length === 0) {
      console.log("No profiles found or database error:", profilesError);
      return NextResponse.json(
        { error: "No profiles found in database" },
        { status: 400 },
      );
    }

    const results = [];

    for (const profile of profiles) {
      const userTimezone = profile.timezone || "UTC";
      const now = new Date();
      const currentHourMinute = new Intl.DateTimeFormat("en-GB", {
        timeZone: userTimezone,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(now);

      const targetHour = currentHourMinute.split(":")[0];
      const morningHour = profile.morning_time?.split(":")[0];
      const eveningHour = profile.evening_time?.split(":")[0];

      console.log(`User ID: ${profile.id}`);
      console.log(`Timezone: ${userTimezone} | Current Hour: ${targetHour}`);
      console.log(
        `Morning Hour in DB: ${morningHour} | Evening Hour in DB: ${eveningHour}`,
      );

      let checkType: "morning" | "evening" | null = null;

      if (targetHour === morningHour) {
        checkType = "morning";
      } else if (targetHour === eveningHour) {
        checkType = "evening";
      }

      if (!checkType) {
        console.log(
          "Skipping user: Current hour does not match morning or evening hour.",
        );
        continue;
      }

      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(
        profile.id,
      );
      const userEmail = userData?.user?.email;

      console.log(`Resolved User Email: ${userEmail}`);

      if (!userEmail) {
        console.log("Skipping user: No email found in auth system.");
        continue;
      }

      // Fetch user's habits
      const { data: habits } = await supabaseAdmin
        .from("habits")
        .select("title")
        .eq("user_id", profile.id);

      const habitTitles =
        habits?.map((h) => h.title).join(", ") || "your daily goals";

      const systemInstruction =
        checkType === "morning"
          ? `You are James Clear, an empathetic productivity coach. Send a concise morning check-in. Their goals are: ${habitTitles}. Ask what time they tackle them today. Max 3 sentences.`
          : `You are James Clear, an empathetic productivity coach. Send a supportive evening review checking in on: ${habitTitles}. Max 3 sentences.`;

      const groqRes = await fetch(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            messages: [{ role: "user", content: systemInstruction }],
          }),
        },
      );

      const groqData = await groqRes.json();
      const aiReply = groqData.choices?.[0]?.message?.content;

      if (!aiReply) continue;

      await supabaseAdmin
        .from("messages")
        .insert([{ user_id: profile.id, sender: "ai", content: aiReply }]);

      await resend.emails.send({
        from: "AccountabilityAI <onboarding@resend.dev>",
        to: userEmail,
        subject:
          checkType === "morning" ? "🌅 Morning Check-in" : "🌙 Evening Review",
        html: `<p>${aiReply}</p>`,
      });

      results.push({ email: userEmail, type: checkType });
    }

    return NextResponse.json({ success: true, processed: results });
  } catch (err: any) {
    console.error("Cron Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
