import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Stars, Wand2, ImageIcon, Sparkles, Shield, Github, Play, CheckCircle2 } from "lucide-react";

// --- Notes -------------------------------------------------------------------
// - Tailwind required. Page uses dark background with animated gradient mesh.
// - Uses framer-motion for tasteful reveals and micro-interactions.
// - CTA sends users into your existing app flow at "/app" (adjust if needed).
// - Replace the demoVideoUrl with a real MP4/GIF later.
// - This is intentionally a single, portable React component for easy drop-in.

const demoVideoUrl = ""; // optional: e.g. "/demo.mp4"

const features = [
  {
    icon: <Wand2 className="w-6 h-6" />, 
    title: "Multi‑Agent Orchestration",
    desc: "Outline, content polish, and visual selection collaborate in real-time.",
  },
  {
    icon: <ImageIcon className="w-6 h-6" />,
    title: "Media Library + AI Visuals",
    desc: "Extract images from docs or generate new ones on the fly.",
  },
  {
    icon: <Stars className="w-6 h-6" />,
    title: "Pixel‑Perfect Export",
    desc: "PPTX matches the live preview, down to frames and typography.",
  },
  {
    icon: <Shield className="w-6 h-6" />,
    title: "Idempotent + Observable",
    desc: "Request IDs, Server‑Timing spans, and idempotent builds by default.",
  },
];

const steps = [
  { n: 1, title: "Upload", desc: "PDF, DOCX, or TXT — we parse text and assets." },
  { n: 2, title: "Generate", desc: "Agents craft a clean, structured outline." },
  { n: 3, title: "Beautify", desc: "Pick layouts, apply themes, add visuals." },
  { n: 4, title: "Export", desc: "Download PPTX or open directly in Google Slides." },
];

function GlowButton({ children, onClick, href }: { children: React.ReactNode; onClick?: () => void; href?: string }) {
  const Cmp: any = href ? 'a' : 'button';
  return (
    <Cmp
      href={href}
      onClick={onClick}
      className="relative inline-flex items-center gap-2 px-5 py-3 rounded-2xl font-medium text-white bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 shadow-lg shadow-indigo-500/25 transition-transform hover:-translate-y-0.5 focus:outline-none"
    >
      {children}
      <ArrowRight className="w-4 h-4" />
      <span className="absolute -z-10 inset-0 blur-xl opacity-60 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-2xl" />
    </Cmp>
  );
}

function GlassCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative rounded-3xl border border-white/10 bg-white/[0.03] backdrop-blur-md ${className}`}>
      <div className="absolute inset-0 rounded-3xl bg-gradient-to-b from-white/5 to-transparent pointer-events-none" />
      {children}
    </div>
  );
}

export default function Landing() {
  const [lightbox, setLightbox] = useState(false);

  return (
    <div className="min-h-screen w-full bg-[#0B1020] text-white relative overflow-hidden">
      {/* Animated gradient mesh */}
      <div className="pointer-events-none absolute -top-1/3 left-1/2 -translate-x-1/2 w-[1200px] h-[1200px] rounded-full opacity-40 animate-[spin_18s_linear_infinite]"
           style={{
             background: "radial-gradient(closest-side, rgba(99,102,241,0.6), rgba(168,85,247,0.35), rgba(236,72,153,0.2), transparent)",
             filter: "blur(60px)",
           }}
      />

      {/* Subtle grid */}
      <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:16px_16px] opacity-30" />

      {/* NAVBAR */}
      <nav className="relative z-10 max-w-7xl mx-auto px-6 py-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-indigo-400" />
          <span className="font-semibold tracking-wide">PresenTuneAI</span>
          <span className="ml-3 text-xs px-2 py-1 rounded-full bg-white/10 border border-white/10">Open Model Hackathon</span>
        </div>
        <div className="flex items-center gap-3">
          <a href="https://github.com" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm text-white/80 hover:text-white">
            <Github className="w-4 h-4" /> GitHub
          </a>
          <a href="#features" className="text-sm text-white/80 hover:text-white">Features</a>
          <GlowButton href="/app">Try the Demo</GlowButton>
        </div>
      </nav>

      {/* HERO */}
      <header className="relative z-10 max-w-7xl mx-auto px-6 pt-6 pb-8 md:pb-16">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/5 text-xs text-white/80">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            Built with fine‑tuned gpt‑oss • Pixel‑perfect PPTX
          </div>
          <h1 className="mt-6 text-4xl md:text-6xl font-bold leading-tight tracking-tight">
            Turn documents into <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-fuchsia-400 to-pink-400">stunning presentations</span> — instantly
          </h1>
          <p className="mt-4 md:mt-6 text-white/80 max-w-2xl">
            Multi‑agent AI that drafts, designs, and exports slides in minutes. Edit content, pick layouts, and download a PPTX that matches the live preview.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <GlowButton href="/app">Try the Demo</GlowButton>
            <button onClick={() => setLightbox(true)} className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-white/10 border border-white/10 hover:bg-white/15 transition">
              <Play className="w-4 h-4" /> Watch 30s preview
            </button>
          </div>
        </motion.div>

        {/* Mocked App Preview */}
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.7 }}>
          <GlassCard className="mt-12 md:mt-16 p-2 shadow-2xl">
            <div className="aspect-[16/9] rounded-[18px] bg-gradient-to-br from-slate-900 to-slate-800 border border-white/10 overflow-hidden relative">
              {/* Decorative highlights */}
              <div className="absolute -top-10 -left-10 w-56 h-56 bg-indigo-500/40 blur-3xl rounded-full" />
              <div className="absolute -bottom-12 -right-10 w-72 h-72 bg-pink-500/30 blur-3xl rounded-full" />
              {/* Faux window chrome */}
              <div className="absolute top-0 left-0 right-0 h-10 bg-white/5 border-b border-white/10 flex items-center gap-2 px-4">
                <div className="w-3 h-3 rounded-full bg-red-400/80" />
                <div className="w-3 h-3 rounded-full bg-yellow-400/80" />
                <div className="w-3 h-3 rounded-full bg-green-400/80" />
                <span className="ml-3 text-xs text-white/60">Editor Workbench — live preview</span>
              </div>
              {/* Placeholder preview blocks */}
              <div className="p-6 pt-14 grid grid-cols-12 gap-4">
                <div className="col-span-4 hidden md:block">
                  <div className="space-y-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="h-14 rounded-xl bg-white/5 border border-white/10" />
                    ))}
                  </div>
                </div>
                <div className="col-span-12 md:col-span-8">
                  <div className="h-full rounded-2xl border border-white/10 bg-[#0d1326] relative overflow-hidden">
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(99,102,241,0.2),transparent_50%),radial-gradient(ellipse_at_bottom_right,rgba(236,72,153,0.15),transparent_50%)]" />
                    <div className="relative p-8">
                      <div className="h-8 w-3/5 rounded-lg bg-white/70 mb-6" />
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-3">
                          {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="h-3 w-11/12 rounded bg-white/30" />
                          ))}
                        </div>
                        <div className="rounded-xl h-40 bg-white/10 border border-white/10" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </GlassCard>
        </motion.div>
      </header>

      {/* FEATURES */}
      <section id="features" className="relative z-10 max-w-7xl mx-auto px-6 py-12 md:py-20">
        <motion.h2 initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }} className="text-2xl md:text-3xl font-semibold">
          Why judges will love it
        </motion.h2>
        <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((f, idx) => (
            <motion.div key={idx} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: idx * 0.05, duration: 0.55 }}>
              <GlassCard className="p-5 h-full">
                <div className="flex items-center gap-3 text-indigo-300">
                  {f.icon}
                  <h3 className="font-medium text-white">{f.title}</h3>
                </div>
                <p className="mt-3 text-sm text-white/75 leading-relaxed">{f.desc}</p>
              </GlassCard>
            </motion.div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 py-12 md:py-20">
        <motion.h2 initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }} className="text-2xl md:text-3xl font-semibold">
          4‑step flow
        </motion.h2>
        <div className="mt-8 grid md:grid-cols-4 gap-6">
          {steps.map((s, i) => (
            <motion.div key={s.n} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.06, duration: 0.5 }}>
              <GlassCard className="p-5 h-full">
                <div className="text-white/60 text-sm">Step {s.n}</div>
                <div className="mt-1 font-semibold">{s.title}</div>
                <p className="mt-2 text-sm text-white/75">{s.desc}</p>
              </GlassCard>
            </motion.div>
          ))}
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 pb-20">
        <GlassCard className="p-8 md:p-10 text-center">
          <motion.h3 initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.45 }} className="text-2xl md:text-3xl font-semibold">
            Ready to see it build a deck in seconds?
          </motion.h3>
          <p className="mt-2 text-white/75">No signup. Works in your browser.</p>
          <div className="mt-6">
            <GlowButton href="/app">Try PresenTuneAI</GlowButton>
          </div>
        </GlassCard>
      </section>

      {/* FOOTER */}
      <footer className="relative z-10 max-w-7xl mx-auto px-6 pb-10">
        <div className="text-sm text-white/60 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div>© {new Date().getFullYear()} PresenTuneAI. Built for the OpenAI Open Model Hackathon.</div>
          <div className="flex items-center gap-4">
            <a className="hover:text-white" href="/docs">Docs</a>
            <a className="hover:text-white" href="/privacy">Privacy</a>
            <a className="hover:text-white" href="https://github.com" target="_blank" rel="noreferrer">GitHub</a>
          </div>
        </div>
      </footer>

      {/* LIGHTBOX */}
      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-6" onClick={() => setLightbox(false)}>
          <div className="max-w-4xl w-full" onClick={(e) => e.stopPropagation()}>
            <GlassCard className="p-2">
              <div className="rounded-2xl overflow-hidden aspect-video bg-black">
                {demoVideoUrl ? (
                  <video src={demoVideoUrl} controls autoPlay className="w-full h-full" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white/70">Replace with demo video</div>
                )}
              </div>
            </GlassCard>
          </div>
        </div>
      )}
    </div>
  );
}
