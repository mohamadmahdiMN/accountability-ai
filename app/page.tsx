"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/utils/supabase";
import { User } from "@supabase/supabase-js";

export default function Home() {
  // --- Settings State ---
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [morningTime, setMorningTime] = useState("09:00");
  const [eveningTime, setEveningTime] = useState("21:00");
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Auto-detect the user's timezone (e.g., "Europe/Rome" or "America/New_York")
  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  );

  // Fetch preferences when the settings modal opens
  const fetchPreferences = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (data) {
      setMorningTime(data.morning_time);
      setEveningTime(data.evening_time);
      if (data.timezone) setTimezone(data.timezone);
    }
  };

  // Save preferences using Upsert (creates the row if it doesn't exist, updates if it does)
  const savePreferences = async () => {
    if (!user) return;

    const { error } = await supabase.from("profiles").upsert({
      id: user.id,
      morning_time: morningTime,
      evening_time: eveningTime,
      timezone: timezone,
    });

    if (error) {
      console.error("Error saving preferences:", error.message);
      alert("Failed to save settings.");
    } else {
      // Show the success message
      setSaveSuccess(true);

      // Wait 1.5 seconds, then reset the message and close the modal
      setTimeout(() => {
        setSaveSuccess(false);
        setIsSettingsOpen(false);
      }, 1500);
    }
  };

  // Trigger fetch when modal opens
  useEffect(() => {
    if (isSettingsOpen) fetchPreferences();
  }, [isSettingsOpen]);
  // Authentication & User States
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [authError, setAuthError] = useState("");

  // App Data States
  const [habits, setHabits] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [newHabitTitle, setNewHabitTitle] = useState("");

  // Auto-scroll Anchor & Logic
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 1. Check if a user is already logged in when the app loads
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // 2. Fetch data from Supabase once the user is authenticated
  useEffect(() => {
    if (user) {
      fetchHabits();
      fetchMessages();
    }
  }, [user]);

  const fetchHabits = async () => {
    const { data } = await supabase
      .from("habits")
      .select("*")
      .order("created_at", { ascending: true });
    if (data) setHabits(data);
  };

  const fetchMessages = async () => {
    const { data } = await supabase
      .from("messages")
      .select("*")
      .order("created_at", { ascending: true });
    if (data) setMessages(data);
  };

  // 3. Handle Login and Sign Up
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");

    if (isSignUp) {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) setAuthError(error.message);
      else alert("Check your email for the confirmation link!");
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) setAuthError(error.message);
    }
  };

  // 4. Add a new habit to the database
  const handleAddHabit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHabitTitle.trim() || !user) return;

    const { error } = await supabase
      .from("habits")
      .insert([{ title: newHabitTitle, user_id: user.id }]);

    if (!error) {
      setNewHabitTitle("");
      fetchHabits();
    }
  };

  // 5. Toggle habit completion status in the database
  const handleToggleHabit = async (id: string, currentStatus: boolean) => {
    const { error } = await supabase
      .from("habits")
      .update({ is_completed: !currentStatus })
      .eq("id", id);

    if (!error) fetchHabits();
  };

  // 6. Send a message, call Gemini/Groq, and save everything to Supabase
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || !user) return;

    const userMessage = inputMessage;
    setInputMessage("");

    // Step A: Save user message to Supabase
    const { error } = await supabase
      .from("messages")
      .insert([{ content: userMessage, sender: "user", user_id: user.id }]);

    if (error) {
      console.error("Error saving message:", error.message);
      return;
    }

    fetchMessages();

    try {
      // Step B: Call our backend AI route
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage, habits }),
      });

      // Catch HTML error pages before parsing as JSON
      if (!res.ok) {
        const errorText = await res.text();
        console.error(`API Error (${res.status}):`, errorText);
        alert(
          `Server error (${res.status}). Check terminal or browser console!`,
        );
        return;
      }

      const data = await res.json();

      if (data.reply) {
        // Step C: Save real AI response to Supabase
        await supabase.from("messages").insert([
          {
            content: data.reply,
            sender: "ai",
            user_id: user.id,
          },
        ]);
        fetchMessages();
      }
    } catch (err) {
      console.error("Failed to connect to AI route:", err);
    }
  };

  // 7. Clear chat history from Supabase and local state
  const handleClearChat = async () => {
    if (!user) return;

    // Add a quick confirmation dialog so the user doesn't delete it by accident
    if (!window.confirm("Are you sure you want to clear your chat history?"))
      return;

    // Delete all messages belonging to this user from Supabase
    const { error } = await supabase
      .from("messages")
      .delete()
      .eq("user_id", user.id);

    if (error) {
      console.error("Error clearing chat:", error.message);
      alert("Failed to clear chat history.");
      return;
    }

    // Instantly clear the UI
    setMessages([]);
  };

  const handleLogout = () => supabase.auth.signOut();

  // AUTHENTICATION SCREEN VIEW
  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4 text-slate-100">
        <div className="w-full max-w-md space-y-6 bg-slate-900 p-8 rounded-2xl border border-slate-800 shadow-xl">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-indigo-400">
              AccountabilityAI
            </h1>
            <p className="text-sm text-slate-400 mt-2">
              Sign in to talk to your behavior coach
            </p>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-400 block mb-1">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-100 outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-400 block mb-1">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-100 outline-none focus:border-indigo-500"
              />
            </div>
            {authError && (
              <p className="text-xs text-rose-400 bg-rose-500/10 p-3 rounded-lg border border-rose-500/20">
                {authError}
              </p>
            )}
            <button
              type="submit"
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white p-3 rounded-xl text-sm font-medium transition shadow-lg shadow-indigo-600/10"
            >
              {isSignUp ? "Create Free Account" : "Sign In"}
            </button>
          </form>

          <div className="text-center pt-2">
            <button
              type="button"
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-xs text-indigo-400 hover:underline"
            >
              {isSignUp
                ? "Already have an account? Sign In"
                : "Don't have an account? Sign Up"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // MAIN APPLICATION VIEW
  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 font-sans">
      {/* SIDEBAR: Habits Manager */}
      <aside className="w-80 bg-slate-900 border-r border-slate-800 p-6 flex flex-col justify-between hidden md:flex">
        <div className="space-y-6 overflow-y-auto">
          <h1 className="text-xl font-bold tracking-tight text-indigo-400">
            AccountabilityAI
          </h1>

          {/* New Habit Input Form */}
          <form onSubmit={handleAddHabit} className="space-y-2">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
              Add a New Habit
            </label>
            <div className="flex space-x-2">
              <input
                type="text"
                placeholder="e.g., Read 10 pages"
                value={newHabitTitle}
                onChange={(e) => setNewHabitTitle(e.target.value)}
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs outline-none focus:border-indigo-500 text-slate-100"
              />
              <button
                type="submit"
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 rounded-xl text-xs font-medium transition"
              >
                +
              </button>
            </div>
          </form>

          {/* Habits Stream */}
          <div>
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Today's Progress
            </h2>
            <div className="space-y-3">
              {habits.map((habit) => (
                <div
                  key={habit.id}
                  className="flex items-center space-x-3 bg-slate-800/50 p-3 rounded-xl border border-slate-800 hover:border-slate-700 transition"
                >
                  <input
                    type="checkbox"
                    checked={habit.is_completed}
                    onChange={() =>
                      handleToggleHabit(habit.id, habit.is_completed)
                    }
                    className="h-5 w-5 rounded border-slate-700 bg-slate-900 text-indigo-500 focus:ring-indigo-500/20 focus:ring-offset-0 cursor-pointer"
                  />
                  <span
                    className={`text-sm ${habit.is_completed ? "line-through text-slate-500" : "text-slate-200"}`}
                  >
                    {habit.title}
                  </span>
                </div>
              ))}
              {habits.length === 0 && (
                <p className="text-xs text-slate-500 italic">
                  No habits added yet.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* User Footer Account Controls */}
        <div className="border-t border-slate-800 pt-4 flex items-center justify-between">
          <span className="text-xs text-slate-400 truncate max-w-[140px]">
            {user.email}
          </span>
          <button
            onClick={handleLogout}
            className="text-xs text-rose-400 hover:underline"
          >
            Log out
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT: Chat Room */}
      <main className="flex-1 flex flex-col h-full bg-slate-950">
        <header className="h-16 border-b border-slate-800 px-6 flex items-center justify-between bg-slate-900/40 backdrop-blur">
          <div className="flex items-center space-x-3">
            <div className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse"></div>
            <p className="font-medium text-sm text-slate-200">
              James Clear AI Coach
            </p>
          </div>

          {/* Settings Button */}
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="text-xs text-slate-400 hover:text-emerald-400 transition bg-slate-800/50 hover:bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-slate-700 hover:border-emerald-500/30 ml-2"
          >
            Settings
          </button>

          {/* Clear Chat Button */}
          {messages.length > 0 && (
            <button
              onClick={handleClearChat}
              className="text-xs text-slate-400 hover:text-rose-400 transition bg-slate-800/50 hover:bg-rose-500/10 px-3 py-1.5 rounded-lg border border-slate-700 hover:border-rose-500/30"
            >
              Clear Chat
            </button>
          )}
        </header>

        {/* Messages Window */}
        <div className="flex-1 overflow-y-auto p-6 max-w-4xl w-full mx-auto flex flex-col">
          <div className="space-y-4 flex-1 overflow-y-auto pr-2">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col max-w-[75%] ${msg.sender === "user" ? "ml-auto items-end" : "mr-auto items-start"}`}
              >
                <div
                  className={`p-4 rounded-2xl text-sm leading-relaxed ${msg.sender === "user" ? "bg-indigo-600 text-white rounded-tr-none" : "bg-slate-800 text-slate-100 rounded-tl-none border border-slate-700/50"}`}
                >
                  {msg.content}
                </div>
                <span className="text-[10px] text-slate-500 mt-1 px-1">
                  {new Date(msg.created_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            ))}
            {messages.length === 0 && (
              <div className="text-center text-xs text-slate-500 mt-8 italic">
                Say hello to your coach to kick off your accountability journey.
              </div>
            )}

            {/* Invisible anchor element for auto-scroll */}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Messaging Input Footer */}
        <footer className="p-6 border-t border-slate-800 bg-slate-900/20 max-w-4xl w-full mx-auto">
          <form
            onSubmit={handleSendMessage}
            className="flex items-center space-x-3 bg-slate-900 border border-slate-800 rounded-xl p-2 focus-within:border-indigo-500/50 transition"
          >
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Message your coach..."
              className="flex-1 bg-transparent border-0 outline-none text-sm px-3 text-slate-100 placeholder-slate-500 focus:ring-0"
            />
            <button
              type="submit"
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition shadow-lg shadow-indigo-600/10"
            >
              Send
            </button>
          </form>
        </footer>
        {/* SETTINGS MODAL */}
        {isSettingsOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-slate-900 border border-slate-700 p-6 rounded-xl w-full max-w-md">
              <h2 className="text-xl font-bold text-white mb-4">
                Notification Settings
              </h2>

              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Morning Check-in Time
                  </label>
                  <input
                    type="time"
                    value={morningTime}
                    onChange={(e) => setMorningTime(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Evening Review Time
                  </label>
                  <input
                    type="time"
                    value={eveningTime}
                    onChange={(e) => setEveningTime(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Detected Timezone
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={timezone}
                    className="w-full bg-slate-800/50 border border-slate-800 rounded-lg p-2 text-slate-500 cursor-not-allowed"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Your timezone is detected automatically to ensure accurate
                    delivery.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between mt-6">
                {/* Success Message Placeholder */}
                <div>
                  {saveSuccess && (
                    <span className="text-sm text-emerald-400 font-medium animate-pulse">
                      Settings saved successfully!
                    </span>
                  )}
                </div>

                {/* Buttons */}
                <div className="flex space-x-3">
                  <button
                    onClick={() => setIsSettingsOpen(false)}
                    className="px-4 py-2 text-sm text-slate-400 hover:text-white transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={savePreferences}
                    disabled={saveSuccess} // Prevent spam clicking while saving
                    className="px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition disabled:opacity-50"
                  >
                    Save Preferences
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
