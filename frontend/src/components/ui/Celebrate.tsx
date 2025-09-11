import { useEffect, useRef } from "react";

export default function Celebrate({ fire }: { fire: boolean }) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!fire || !ref.current) return;
    // create 30 particles
    for (let i = 0; i < 30; i++) {
      const s = document.createElement("span");
      s.className = "confetti";
      s.style.left = `${50 + (Math.random() * 40 - 20)}%`;
      s.style.background = randomColor();
      s.style.setProperty("--tx", `${(Math.random() * 140 - 70).toFixed(0)}px`);
      s.style.setProperty("--rot", `${(Math.random() * 300 - 150).toFixed(0)}deg`);
      ref.current.appendChild(s);
      setTimeout(() => s.remove(), 1200);
    }
  }, [fire]);

  return (
    <>
      <div ref={ref} className="pointer-events-none fixed inset-0 z-[1100]" />
      <style>{`
        .confetti {
          position: absolute;
          top: 20%;
          width: 8px;
          height: 12px;
          opacity: 0;
          transform: translate(-50%, 0) rotate(0deg);
          animation: confetti-pop 1.2s ease-out forwards;
          border-radius: 2px;
        }
        @keyframes confetti-pop {
          0% { opacity: 0; transform: translate(-50%, 0) rotate(0deg); }
          15%{ opacity: 1; }
          100%{ opacity: 0; transform: translate(calc(-50% + var(--tx)), 260px) rotate(var(--rot)); }
        }
      `}</style>
    </>
  );
}
function randomColor() {
  const palette = ["#111827","#6D28D9","#2563EB","#059669","#F59E0B","#DC2626"];
  return palette[(Math.random() * palette.length) | 0];
}
