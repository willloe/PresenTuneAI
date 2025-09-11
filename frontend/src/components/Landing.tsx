import { useState } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { ArrowRight, Stars, ImageIcon, Sparkles, Shield, Github, Play, CheckCircle2, Zap, Brain, Rocket, Trophy } from "lucide-react";

// --- Notes -------------------------------------------------------------------
// - Tailwind required. Page uses dark background with animated gradient mesh.
// - Uses framer-motion for tasteful reveals and micro-interactions.
// - CTA sends users into your existing app flow at "/app" (adjust if needed).
// - Replace the demoVideoUrl with a real MP4/GIF later.
// - This is intentionally a single, portable React component for easy drop-in.

const demoVideoUrl = ""; // optional: e.g. "/demo.mp4"

const features = [
  {
    icon: <Brain className="w-6 h-6" />, 
    title: "AI-Powered Content Creation",
    desc: "Our multi-agent AI system writes compelling slides, extracts key insights, and structures your story perfectly.",
    color: "from-purple-400 to-pink-400"
  },
  {
    icon: <Zap className="w-6 h-6" />,
    title: "Lightning-Fast Generation", 
    desc: "Transform any document into a stunning presentation in under 60 seconds. No more hours of manual work.",
    color: "from-yellow-400 to-orange-400"
  },
  {
    icon: <ImageIcon className="w-6 h-6" />,
    title: "Smart Visual Enhancement",
    desc: "Automatically extracts images, generates AI visuals, and selects perfect layouts for maximum impact.",
    color: "from-green-400 to-blue-400"
  },
  {
    icon: <Rocket className="w-6 h-6" />,
    title: "Export-Ready Presentations",
    desc: "Download pixel-perfect PPTX files or open directly in Google Slides. What you see is what you get.",
    color: "from-indigo-400 to-purple-400"
  },
];


const steps = [
  { n: 1, title: "Upload", desc: "PDF, DOCX, or TXT — we parse text and assets." },
  { n: 2, title: "Generate", desc: "Agents craft a clean, structured outline." },
  { n: 3, title: "Beautify", desc: "Pick layouts, apply themes, add visuals." },
  { n: 4, title: "Export", desc: "Download PPTX or open directly in Google Slides." },
];

// Advanced floating particles animation
function FloatingParticles() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {Array.from({ length: 50 }).map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-1 h-1 bg-white/20 rounded-full"
          initial={{
            x: Math.random() * (typeof window !== 'undefined' ? window.innerWidth : 1200),
            y: Math.random() * (typeof window !== 'undefined' ? window.innerHeight : 800),
          }}
          animate={{
            x: Math.random() * (typeof window !== 'undefined' ? window.innerWidth : 1200),
            y: Math.random() * (typeof window !== 'undefined' ? window.innerHeight : 800),
          }}
          transition={{
            duration: Math.random() * 20 + 10,
            repeat: Infinity,
            ease: "linear",
          }}
        />
      ))}
    </div>
  );
}

// Enhanced glow button with better animations
function GlowButton({ children, onClick, href, size = "default" }: { children: React.ReactNode; onClick?: () => void; href?: string; size?: "default" | "large" }) {
  const baseClasses = "relative inline-flex items-center gap-2 rounded-2xl font-medium text-white bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 shadow-lg shadow-indigo-500/25 transition-all duration-300 hover:shadow-indigo-500/40 hover:shadow-2xl transform hover:scale-105 overflow-hidden group";
  const sizeClasses = size === "large" ? "px-8 py-4 text-lg" : "px-5 py-3";
  
  const Cmp: any = href ? 'a' : 'button';
  return (
    <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
      <Cmp
        href={href}
        onClick={onClick}
        className={`${baseClasses} ${sizeClasses}`}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
        <span className="relative z-10">{children}</span>
        <ArrowRight className="w-4 h-4 relative z-10 group-hover:translate-x-1 transition-transform" />
        <span className="absolute -z-10 inset-0 blur-xl opacity-60 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-2xl" />
      </Cmp>
    </motion.div>
  );
}

// Enhanced glass card with hover effects
function GlassCard({ children, className = "", hover = false }: { children: React.ReactNode; className?: string; hover?: boolean }) {
  return (
    <motion.div 
      className={`relative rounded-3xl border border-white/10 bg-white/[0.03] backdrop-blur-md ${className} ${hover ? 'hover:bg-white/[0.08] hover:border-white/20 transition-all duration-300' : ''}`}
      whileHover={hover ? { y: -5, scale: 1.02 } : undefined}
    >
      <div className="absolute inset-0 rounded-3xl bg-gradient-to-b from-white/5 to-transparent pointer-events-none" />
      {children}
    </motion.div>
  );
}


export default function Landing() {
  const [lightbox, setLightbox] = useState(false);
  const { scrollYProgress } = useScroll();
  const y = useTransform(scrollYProgress, [0, 1], [0, -50]);
  const opacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);

  return (
    <div className="min-h-screen w-full bg-[#0B1020] text-white relative overflow-hidden">
      {/* Floating Particles */}
      <FloatingParticles />

      {/* Enhanced Animated gradient mesh */}
      <motion.div
        className="pointer-events-none absolute -top-1/3 left-1/2 -translate-x-1/2 w-[1200px] h-[1200px] rounded-full opacity-40"
        animate={{
          rotate: 360,
          scale: [1, 1.1, 1],
        }}
        transition={{
          rotate: { duration: 25, repeat: Infinity, ease: "linear" },
          scale: { duration: 8, repeat: Infinity, ease: "easeInOut" }
        }}
        style={{
          background: "radial-gradient(closest-side, rgba(99,102,241,0.8), rgba(168,85,247,0.5), rgba(236,72,153,0.3), transparent)",
          filter: "blur(80px)",
        }}
      />

      {/* Secondary gradient orb */}
      <motion.div
        className="pointer-events-none absolute top-1/4 right-1/4 w-[600px] h-[600px] rounded-full opacity-30"
        animate={{
          rotate: -360,
          x: [0, 50, 0],
          y: [0, -30, 0],
        }}
        transition={{
          rotate: { duration: 20, repeat: Infinity, ease: "linear" },
          x: { duration: 12, repeat: Infinity, ease: "easeInOut" },
          y: { duration: 8, repeat: Infinity, ease: "easeInOut" }
        }}
        style={{
          background: "radial-gradient(closest-side, rgba(34,197,94,0.4), rgba(59,130,246,0.3), transparent)",
          filter: "blur(60px)",
        }}
      />

      {/* Enhanced grid pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:20px_20px] opacity-40" />
      
      {/* Subtle scanlines effect */}
      <div className="absolute inset-0 bg-[linear-gradient(0deg,transparent_50%,rgba(255,255,255,0.02)_50%)] [background-size:100%_4px] opacity-60" />

      {/* ENHANCED NAVBAR */}
      <motion.nav 
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="relative z-10 max-w-7xl mx-auto px-6 py-6 flex items-center justify-between"
      >
        <motion.div 
          className="flex items-center gap-3"
          whileHover={{ scale: 1.05 }}
        >
          <div className="relative">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
            >
              <Sparkles className="w-7 h-7 text-indigo-400" />
            </motion.div>
            <div className="absolute inset-0 w-7 h-7 bg-indigo-400/20 rounded-full blur-md" />
          </div>
          <span className="font-bold text-xl tracking-wide bg-gradient-to-r from-white to-indigo-200 bg-clip-text text-transparent">PresenTuneAI</span>
          <motion.span 
            className="ml-3 text-xs px-3 py-1 rounded-full bg-gradient-to-r from-emerald-500/20 to-blue-500/20 border border-emerald-400/30 text-emerald-300"
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            🚀 Open Model Hackathon
          </motion.span>
        </motion.div>
        <div className="flex items-center gap-4">
          <motion.a 
            href="https://github.com/willloe/PresenTuneAI" 
            target="_blank" 
            rel="noreferrer" 
            className="inline-flex items-center gap-2 text-sm text-white/80 hover:text-white transition-colors duration-200"
            whileHover={{ y: -2 }}
          >
            <Github className="w-4 h-4" /> GitHub
          </motion.a>
          <motion.a 
            href="#features" 
            className="text-sm text-white/80 hover:text-white transition-colors duration-200"
            whileHover={{ y: -2 }}
          >
            Features
          </motion.a>
          <GlowButton href="/app" size="default">🚀 Try Free Demo</GlowButton>
        </div>
      </motion.nav>

      {/* HERO SECTION */}
      <motion.header 
        className="relative z-10 max-w-7xl mx-auto px-6 pt-8 pb-12 md:pb-20"
        style={{ y, opacity }}
      >
        <div className="text-center">
          <motion.div 
            initial={{ opacity: 0, y: 20 }} 
            animate={{ opacity: 1, y: 0 }} 
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-emerald-400/30 bg-gradient-to-r from-emerald-500/10 to-blue-500/10 text-sm text-emerald-300 mb-6">
              <motion.div
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              </motion.div>
              ✨ Multi-Agent AI • Upload & Generate • Export to PPTX
            </div>
          </motion.div>
          
          <motion.h1 
            initial={{ opacity: 0, y: 30 }} 
            animate={{ opacity: 1, y: 0 }} 
            transition={{ duration: 0.8, delay: 0.4 }}
            className="text-5xl md:text-7xl lg:text-8xl font-extrabold leading-tight tracking-tight mb-6"
          >
            Create{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 animate-pulse">
              Mind-Blowing
            </span>
            <br />
            Presentations in{" "}
            <motion.span 
              className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-orange-400 to-red-400"
              animate={{ 
                backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"],
              }}
              transition={{ duration: 3, repeat: Infinity }}
            >
              Seconds
            </motion.span>
          </motion.h1>
          
          <motion.p 
            initial={{ opacity: 0, y: 20 }} 
            animate={{ opacity: 1, y: 0 }} 
            transition={{ duration: 0.8, delay: 0.6 }}
            className="text-xl md:text-2xl text-white/90 max-w-4xl mx-auto leading-relaxed mb-8"
          >
            Transform any document into 
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400 font-semibold"> professional presentations</span> using 
            multi-agent AI. Upload, generate, export. Built for the Open Model Hackathon.
          </motion.p>

          <motion.div 
            initial={{ opacity: 0, y: 20 }} 
            animate={{ opacity: 1, y: 0 }} 
            transition={{ duration: 0.8, delay: 0.8 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <GlowButton href="/app" size="large">
              🚀 Try the Demo
            </GlowButton>
            <motion.button 
              onClick={() => setLightbox(true)} 
              className="inline-flex items-center gap-3 px-6 py-4 rounded-2xl bg-white/5 border border-white/20 hover:bg-white/10 hover:border-white/30 transition-all duration-300 backdrop-blur-sm group"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <div className="w-10 h-10 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Play className="w-4 h-4 text-white ml-0.5" />
              </div>
              <span className="text-white font-medium">Watch Demo</span>
            </motion.button>
          </motion.div>
        </div>
      </motion.header>

      {/* INTERACTIVE APP PREVIEW */}
      <motion.div 
        initial={{ opacity: 0, y: 50 }} 
        whileInView={{ opacity: 1, y: 0 }} 
        viewport={{ once: true }}
        transition={{ duration: 1, delay: 0.2 }}
        className="relative z-10 max-w-7xl mx-auto px-6 pb-16"
      >
        <GlassCard className="p-3 shadow-2xl hover:shadow-indigo-500/20 transition-all duration-500" hover={true}>
          <div className="aspect-[16/9] rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 border border-white/20 overflow-hidden relative group">
            {/* Enhanced decorative highlights */}
            <motion.div 
              className="absolute -top-10 -left-10 w-64 h-64 bg-indigo-500/50 blur-3xl rounded-full"
              animate={{ 
                scale: [1, 1.2, 1],
                opacity: [0.3, 0.6, 0.3]
              }}
              transition={{ duration: 4, repeat: Infinity }}
            />
            <motion.div 
              className="absolute -bottom-12 -right-10 w-80 h-80 bg-pink-500/40 blur-3xl rounded-full"
              animate={{ 
                scale: [1.2, 1, 1.2],
                opacity: [0.2, 0.5, 0.2]
              }}
              transition={{ duration: 6, repeat: Infinity }}
            />
            
            {/* Enhanced window chrome */}
            <div className="absolute top-0 left-0 right-0 h-12 bg-gradient-to-r from-white/5 to-white/10 border-b border-white/20 flex items-center gap-3 px-5">
              <div className="flex gap-2">
                <motion.div 
                  className="w-3 h-3 rounded-full bg-red-400"
                  whileHover={{ scale: 1.2 }}
                />
                <motion.div 
                  className="w-3 h-3 rounded-full bg-yellow-400"
                  whileHover={{ scale: 1.2 }}
                />
                <motion.div 
                  className="w-3 h-3 rounded-full bg-green-400"
                  whileHover={{ scale: 1.2 }}
                />
              </div>
              <span className="ml-4 text-sm text-white/80 font-medium">PresenTuneAI Studio — Live Editor</span>
              <div className="ml-auto flex items-center gap-2">
                <motion.div 
                  className="w-2 h-2 rounded-full bg-emerald-400"
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
                <span className="text-xs text-emerald-400">AI Processing</span>
              </div>
            </div>
            
            {/* Enhanced preview content */}
            <div className="p-8 pt-16 grid grid-cols-12 gap-6 h-full">
              {/* Sidebar */}
              <div className="col-span-4 hidden md:block">
                <div className="space-y-4">
                  <div className="text-xs text-white/60 mb-3">Document Outline</div>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <motion.div 
                      key={i} 
                      className="h-16 rounded-xl bg-white/5 border border-white/10 p-3 hover:bg-white/10 transition-colors cursor-pointer"
                      whileHover={{ x: 4, backgroundColor: "rgba(255,255,255,0.08)" }}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.1 + 1.2 }}
                    >
                      <div className="h-2 w-3/4 rounded bg-white/40 mb-2" />
                      <div className="h-1.5 w-1/2 rounded bg-white/25" />
                    </motion.div>
                  ))}
                </div>
              </div>
              
              {/* Main preview area */}
              <div className="col-span-12 md:col-span-8">
                <div className="h-full rounded-2xl border border-white/20 bg-gradient-to-br from-[#0d1326] to-[#1a1f3a] relative overflow-hidden">
                  <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(99,102,241,0.3),transparent_60%),radial-gradient(ellipse_at_bottom_right,rgba(236,72,153,0.2),transparent_60%)]" />
                  <div className="relative p-8">
                    <motion.div 
                      className="h-10 w-4/5 rounded-lg bg-gradient-to-r from-white/80 to-white/60 mb-8"
                      initial={{ width: 0 }}
                      animate={{ width: "80%" }}
                      transition={{ delay: 1.5, duration: 1 }}
                    />
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-4">
                        {Array.from({ length: 6 }).map((_, i) => (
                          <motion.div 
                            key={i} 
                            className="h-3 rounded bg-white/40"
                            initial={{ width: 0 }}
                            animate={{ width: `${90 - i * 5}%` }}
                            transition={{ delay: i * 0.15 + 1.8, duration: 0.8 }}
                          />
                        ))}
                      </div>
                      <motion.div 
                        className="rounded-2xl h-48 bg-gradient-to-br from-white/15 to-white/5 border border-white/20 p-4 flex items-center justify-center"
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: 2.5, duration: 0.6 }}
                      >
                        <div className="text-center">
                          <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                          >
                            <ImageIcon className="w-8 h-8 text-white/60 mx-auto mb-2" />
                          </motion.div>
                          <div className="text-xs text-white/50">AI-Generated Visual</div>
                        </div>
                      </motion.div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Hover overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
              <motion.div 
                className="bg-white/10 backdrop-blur-md rounded-2xl px-6 py-3 border border-white/20"
                initial={{ scale: 0 }}
                whileHover={{ scale: 1 }}
              >
                <span className="text-white font-medium">Click to Try Interactive Demo</span>
              </motion.div>
            </div>
          </div>
        </GlassCard>
      </motion.div>

      {/* FEATURES SECTION */}
      <section id="features" className="relative z-10 max-w-7xl mx-auto px-6 py-16 md:py-24">
        <div className="text-center mb-16">
          <motion.h2 
            initial={{ opacity: 0, y: 20 }} 
            whileInView={{ opacity: 1, y: 0 }} 
            viewport={{ once: true }} 
            transition={{ duration: 0.8 }}
            className="text-3xl md:text-5xl font-bold mb-4"
          >
            What Makes PresenTuneAI{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">
              Special
            </span>
          </motion.h2>
          <motion.p 
            initial={{ opacity: 0, y: 20 }} 
            whileInView={{ opacity: 1, y: 0 }} 
            viewport={{ once: true }} 
            transition={{ duration: 0.8, delay: 0.2 }}
            className="text-lg text-white/80 max-w-3xl mx-auto"
          >
            A hackathon project exploring multi-agent AI for presentation generation. 
            Here's what we've built:
          </motion.p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {features.map((f, idx) => (
            <motion.div 
              key={idx} 
              initial={{ opacity: 0, y: 30, scale: 0.9 }} 
              whileInView={{ opacity: 1, y: 0, scale: 1 }} 
              viewport={{ once: true }} 
              transition={{ 
                delay: idx * 0.15, 
                duration: 0.6,
                type: "spring",
                stiffness: 100
              }}
            >
              <GlassCard className="p-6 h-full group cursor-pointer" hover={true}>
                <div className="relative">
                  {/* Gradient background for icon */}
                  <div className={`w-14 h-14 rounded-2xl bg-gradient-to-r ${f.color} p-0.5 mb-6 group-hover:scale-110 transition-transform duration-300`}>
                    <div className="w-full h-full rounded-2xl bg-slate-900/50 flex items-center justify-center">
                      <div className="text-white group-hover:scale-110 transition-transform duration-300">
                        {f.icon}
                      </div>
                    </div>
                  </div>
                  
                  <h3 className="font-semibold text-xl text-white mb-3 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-indigo-400 group-hover:to-purple-400 transition-all duration-300">
                    {f.title}
                  </h3>
                  
                  <p className="text-white/80 leading-relaxed group-hover:text-white/90 transition-colors duration-300">
                    {f.desc}
                  </p>
                  
                  {/* Hover effect indicator */}
                  <motion.div 
                    className="absolute -inset-1 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 -z-10"
                    whileHover={{ scale: 1.02 }}
                  />
                </div>
              </GlassCard>
            </motion.div>
          ))}
        </div>

        {/* Call-to-action after features */}
        <motion.div 
          initial={{ opacity: 0, y: 30 }} 
          whileInView={{ opacity: 1, y: 0 }} 
          viewport={{ once: true }} 
          transition={{ duration: 0.8, delay: 0.6 }}
          className="text-center mt-16"
        >
          <p className="text-white/70 mb-6">Want to try it out?</p>
          <GlowButton href="/app" size="large">
            🎨 Try the Demo
          </GlowButton>
        </motion.div>
      </section>


      {/* HOW IT WORKS - ENHANCED */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 py-16 md:py-24">
        <div className="text-center mb-16">
          <motion.h2 
            initial={{ opacity: 0, y: 20 }} 
            whileInView={{ opacity: 1, y: 0 }} 
            viewport={{ once: true }} 
            transition={{ duration: 0.8 }}
            className="text-3xl md:text-5xl font-bold mb-4"
          >
            How It{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-400">
              Works
            </span>
          </motion.h2>
          <motion.p 
            initial={{ opacity: 0, y: 20 }} 
            whileInView={{ opacity: 1, y: 0 }} 
            viewport={{ once: true }} 
            transition={{ duration: 0.8, delay: 0.2 }}
            className="text-lg text-white/80 max-w-3xl mx-auto"
          >
            Simple 4-step process to transform your documents into presentations.
          </motion.p>
        </div>

        <div className="grid md:grid-cols-4 gap-8">
          {steps.map((step, i) => (
            <motion.div 
              key={step.n} 
              initial={{ opacity: 0, y: 30, scale: 0.8 }} 
              whileInView={{ opacity: 1, y: 0, scale: 1 }} 
              viewport={{ once: true }} 
              transition={{ 
                delay: i * 0.15, 
                duration: 0.6,
                type: "spring",
                stiffness: 100
              }}
              className="relative"
            >
              <GlassCard className="p-6 h-full group text-center" hover={true}>
                <div className="relative">
                  {/* Step number with gradient */}
                  <div className="w-16 h-16 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 flex items-center justify-center text-2xl font-bold text-white mb-6 mx-auto group-hover:scale-110 transition-transform duration-300">
                    {step.n}
                  </div>
                  
                  <h3 className="font-bold text-xl text-white mb-3 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-indigo-400 group-hover:to-purple-400 transition-all duration-300">
                    {step.title}
                  </h3>
                  
                  <p className="text-white/80 leading-relaxed group-hover:text-white/90 transition-colors duration-300">
                    {step.desc}
                  </p>
                </div>
                
                {/* Connection line to next step */}
                {i < steps.length - 1 && (
                  <motion.div 
                    className="hidden md:block absolute top-8 -right-4 w-8 h-0.5 bg-gradient-to-r from-indigo-400/60 to-transparent"
                    initial={{ scaleX: 0 }}
                    whileInView={{ scaleX: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.15 + 0.5, duration: 0.6 }}
                  />
                )}
              </GlassCard>
            </motion.div>
          ))}
        </div>

        {/* CTA after steps */}
        <motion.div 
          initial={{ opacity: 0, y: 30 }} 
          whileInView={{ opacity: 1, y: 0 }} 
          viewport={{ once: true }} 
          transition={{ duration: 0.8, delay: 0.8 }}
          className="text-center mt-16"
        >
          <p className="text-white/70 mb-6 text-lg">Ready to give it a try?</p>
          <GlowButton href="/app" size="large">
            ⚡ Try the Demo
          </GlowButton>
        </motion.div>
      </section>

      {/* FINAL CTA - ENHANCED */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 py-20">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
        >
          <GlassCard className="p-12 md:p-16 text-center relative overflow-hidden" hover={true}>
            {/* Background gradient effect */}
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-purple-500/10 to-pink-500/10" />
            
            <div className="relative z-10">
              <motion.div
                initial={{ scale: 0 }}
                whileInView={{ scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="w-20 h-20 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full flex items-center justify-center mx-auto mb-8"
              >
                <Trophy className="w-10 h-10 text-white" />
              </motion.div>
              
              <motion.h3 
                initial={{ opacity: 0, y: 20 }} 
                whileInView={{ opacity: 1, y: 0 }} 
                viewport={{ once: true }} 
                transition={{ duration: 0.6, delay: 0.3 }} 
                className="text-3xl md:text-5xl font-bold mb-4"
              >
                Ready to{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">
                  Try It Out?
                </span>
              </motion.h3>
              
              <motion.p 
                initial={{ opacity: 0, y: 20 }} 
                whileInView={{ opacity: 1, y: 0 }} 
                viewport={{ once: true }} 
                transition={{ duration: 0.6, delay: 0.4 }} 
                className="text-xl text-white/80 mb-8 max-w-3xl mx-auto"
              >
                🚀 <strong>No signup required</strong> • 💻 <strong>Works in your browser</strong> • 
                🎨 <strong>Hackathon demo project</strong> • ⚡ <strong>Multi-agent AI</strong>
              </motion.p>
              
              <motion.div 
                initial={{ opacity: 0, y: 20 }} 
                whileInView={{ opacity: 1, y: 0 }} 
                viewport={{ once: true }} 
                transition={{ duration: 0.6, delay: 0.6 }}
                className="flex flex-col sm:flex-row items-center justify-center gap-4"
              >
                <GlowButton href="/app" size="large">
                  🎯 Try the Demo
                </GlowButton>
              </motion.div>
              
              {/* Tech indicators */}
              <motion.div 
                initial={{ opacity: 0 }} 
                whileInView={{ opacity: 1 }} 
                viewport={{ once: true }} 
                transition={{ duration: 0.6, delay: 0.8 }}
                className="mt-12 flex flex-wrap items-center justify-center gap-8 text-white/60"
              >
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm">Open Source</span>
                </div>
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-yellow-400" />
                  <span className="text-sm">Multi-Agent AI</span>
                </div>
                <div className="flex items-center gap-2">
                  <Stars className="w-4 h-4 text-purple-400" />
                  <span className="text-sm">Hackathon Project</span>
                </div>
                <div className="flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-orange-400" />
                  <span className="text-sm">Demo Ready</span>
                </div>
              </motion.div>
            </div>
          </GlassCard>
        </motion.div>
      </section>

      {/* ENHANCED FOOTER */}
      <footer className="relative z-10 max-w-7xl mx-auto px-6 py-12">
        <div className="border-t border-white/10 pt-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
              >
                <Sparkles className="w-6 h-6 text-indigo-400" />
              </motion.div>
              <span className="font-bold text-lg bg-gradient-to-r from-white to-indigo-200 bg-clip-text text-transparent">
                PresenTuneAI
              </span>
              <span className="text-white/40">•</span>
              <span className="text-white/60 text-sm">
                Making presentations magical since 2025
              </span>
            </div>
            
            <div className="flex items-center gap-6">
              <motion.a 
                className="text-white/60 hover:text-white transition-colors duration-200 text-sm" 
                href="/docs"
                whileHover={{ y: -2 }}
              >
                Documentation
              </motion.a>
              <motion.a 
                className="text-white/60 hover:text-white transition-colors duration-200 text-sm" 
                href="/privacy"
                whileHover={{ y: -2 }}
              >
                Privacy Policy
              </motion.a>
              <motion.a 
                className="inline-flex items-center gap-2 text-white/60 hover:text-white transition-colors duration-200 text-sm" 
                href="https://github.com/willloe/PresenTuneAI" 
                target="_blank" 
                rel="noreferrer"
                whileHover={{ y: -2 }}
              >
                <Github className="w-4 h-4" /> GitHub
              </motion.a>
            </div>
          </div>
          
          <div className="mt-6 pt-6 border-t border-white/5 text-center">
            <p className="text-white/50 text-sm">
              © {new Date().getFullYear()} PresenTuneAI. Built with ❤️ for the OpenAI Open Model Hackathon. 
              <span className="ml-2 text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">
                Transforming presentations, one document at a time.
              </span>
            </p>
          </div>
        </div>
      </footer>

      {/* ENHANCED LIGHTBOX */}
      {lightbox && (
        <motion.div 
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-6" 
          onClick={() => setLightbox(false)}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div 
            className="max-w-5xl w-full" 
            onClick={(e) => e.stopPropagation()}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          >
            <GlassCard className="p-4 relative">
              {/* Close button */}
              <motion.button
                onClick={() => setLightbox(false)}
                className="absolute -top-4 -right-4 w-10 h-10 bg-red-500 hover:bg-red-400 rounded-full flex items-center justify-center text-white z-10 transition-colors"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
              >
                ✕
              </motion.button>
              
              <div className="rounded-3xl overflow-hidden aspect-video bg-gradient-to-br from-slate-900 to-slate-800 relative">
                {demoVideoUrl ? (
                  <video src={demoVideoUrl} controls autoPlay className="w-full h-full" />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-white/70 relative">
                    {/* Animated background */}
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(99,102,241,0.3),transparent_70%)]" />
                    <div className="relative z-10 text-center">
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                        className="w-16 h-16 border-4 border-indigo-400 border-t-transparent rounded-full mx-auto mb-6"
                      />
                      <h3 className="text-2xl font-bold mb-4 text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">
                        Demo Video Coming Soon!
                      </h3>
                      <p className="text-lg text-white/80 mb-6">
                        We're working on a demo video to showcase the presentation generation process.
                      </p>
                      <p className="text-white/60 mb-8">
                        For now, you can try the live demo to see how it works.
                      </p>
                      <GlowButton href="/app" size="large">
                        🚀 Try the Live Demo
                      </GlowButton>
                    </div>
                  </div>
                )}
              </div>
            </GlassCard>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
