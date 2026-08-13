Markdown
# 🎯 Accountability AI

> An automated, timezone-aware AI productivity coach that checks in on your daily goals, delivers personalized coaching via chat and email, and keeps you on track using automated background jobs.

---

## 🚀 Features

* **🤖 AI Coaching Engine:** Powered by Groq (`llama-3.3-70b-versatile`), delivering concise, empathetic morning check-ins and evening reviews inspired by *Atomic Habits*.
* **⏰ Timezone & Schedule Aware:** Automatically converts check-in schedules based on each user's local timezone (`Asia/Tehran`, `UTC`, etc.).
* **📧 Automated Email Notifications:** Integrated with the Resend API to deliver daily check-in prompts directly to your inbox.
* **💬 Real-Time Chat Interface:** Built with Next.js App Router for seamless interactive goal-tracking and coaching conversations.
* **⚡ Serverless Cron Architecture:** Fully automated background engine that matches user check-in hours, triggers LLM responses, and updates database records on schedule.

---

## 🛠️ Tech Stack

| Category | Technology |
| :--- | :--- |
| **Framework** | [Next.js](https://nextjs.org/) (App Router, TypeScript) |
| **Styling** | [Tailwind CSS](https://tailwindcss.com/) |
| **Database & Auth** | [Supabase](https://supabase.com/) (PostgreSQL & Service Role Auth) |
| **AI Model** | [Groq API](https://groq.com/) (`llama-3.3-70b-versatile`) |
| **Email Delivery** | [Resend](https://resend.com/) |
| **Deployment & Crons** | [Vercel](https://vercel.com/) / [Cron-job.org](https://cron-job.org/) |

---

## 🏗️ Architecture Flow

[ Scheduled Cron Trigger ]
│
▼
[ /api/cron Endpoint ]
│
├──▶ 1. Query user profiles & timezones from Supabase
├──▶ 2. Filter profiles matching current local hour
├──▶ 3. Fetch user habits & construct personalized LLM prompt
├──▶ 4. Generate coaching message via Groq AI
├──▶ 5. Save generated message to Supabase chat table
└──▶ 6. Dispatch email notification using Resend API


---

## ⚙️ Getting Started

### Prerequisites

* Node.js 18+ installed on your machine
* A [Supabase](https://supabase.com/) project
* A [Groq](https://groq.com/) API Key
* A [Resend](https://resend.com/) API Key

### Installation

1. **Clone the repository:**
   ```bash
   git clone [https://github.com/mohamadmahdiMN/accountability-ai.git](https://github.com/mohamadmahdiMN/accountability-ai.git)
   cd accountability-ai
Install dependencies:

Bash
npm install
Configure Environment Variables:
Create a .env.local file in the root directory and populate it with your credentials:

Code snippet
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
GROQ_API_KEY=your_groq_api_key
RESEND_API_KEY=your_resend_api_key
Database Setup:
Run the following schema in your Supabase SQL Editor:

SQL
-- User Profiles
create table public.profiles (
  id uuid references auth.users not null primary key,
  timezone text default 'UTC',
  morning_time time default '09:00:00',
  evening_time time default '21:00:00'
);

-- User Habits
create table public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  title text not null,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- Chat Messages
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  sender text check (sender in ('user', 'ai')),
  content text not null,
  created_at timestamp with time zone default timezone('utc'::text, now())
);
Run the local development server:

Bash
npm run dev
Open http://localhost:3000 in your browser to test the application.

🧪 Testing the Cron Route Locally
You can manually trigger the background process by navigating to:

Plaintext
http://localhost:3000/api/cron
If the current hour matches your saved morning_time or evening_time in Supabase, the route will return:

JSON
{
  "success": true,
  "processed": [
    {
      "email": "user@example.com",
      "type": "morning"
    }
  ]
}
🌐 Production Deployment
Push your repository to GitHub:

Bash
git add .
git commit -m "Deploy accountability-ai"
git push origin main
Import to Vercel:

Import accountability-ai into your Vercel dashboard.

Add all 5 environment variables from .env.local into Vercel Project Settings.

Deploy the application.

Schedule Hourly Triggers:

Use cron-job.org to target https://your-app.vercel.app/api/cron every hour on the hour (0 * * * *).

📜 License
Distributed under the MIT License. See LICENSE for more information
