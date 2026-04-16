"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Mail, Lock, Eye, EyeOff } from "lucide-react";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error?.message ?? "Login failed");
        return;
      }
      router.replace("/admin/dashboard");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-[#F8F9FA] px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-gray-200 shadow-xl p-8">
        <div className="flex flex-col items-center mb-8">
          <div className="p-1 bg-linear-to-br from-white to-gray-50 rounded-sm ring-1 ring-black/5 shadow-[0_10px_30px_rgba(0,0,0,0.12),0_4px_10px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.8)]">
            <Image
              src="/logo-red-text.png"
              alt="BarberHero"
              width={200}
              height={80}
              priority
              className="h-auto w-auto max-h-20"
            />
          </div>
          <h1 className="text-2xl font-bold text-[#1A1A1A] mt-5">Admin Panel</h1>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
              <Mail className="w-4 h-4 text-gray-500" />
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full px-3 py-2.5 bg-[#F5F5F5] rounded-lg text-sm text-[#1A1A1A] placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-[#D42B2B]"
              placeholder="admin@barberhero.com"
            />
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
              <Lock className="w-4 h-4 text-gray-500" />
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full pl-3 pr-10 py-2.5 bg-[#F5F5F5] rounded-lg text-sm text-[#1A1A1A] placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-[#D42B2B]"
                placeholder="Enter password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-500 hover:text-[#1A1A1A] rounded"
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {error && <p className="text-sm text-[#DC2626]">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 mt-2 bg-[#D42B2B] text-white text-sm font-bold uppercase tracking-wider rounded-lg shadow-lg shadow-red-500/30 hover:bg-[#A81E1E] hover:shadow-red-500/50 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100 transition-all"
          >
            {loading ? "Logging in…" : "Log In"}
          </button>
        </form>
      </div>
    </div>
  );
}
