import { LazyMotion, domAnimation, m, type Variants } from "framer-motion";

export const MotionProvider = ({ children }: { children: React.ReactNode }) => (
  <LazyMotion features={domAnimation}>{children}</LazyMotion>
);

export const M = m;

export const fadeUp: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", stiffness: 400, damping: 30, mass: 0.6 },
  },
  exit: { opacity: 0, y: 12, transition: { duration: 0.15 } },
};

export const scaleIn: Variants = {
  initial: { opacity: 0, scale: 0.98 },
  animate: {
    opacity: 1,
    scale: 1,
    transition: { type: "spring", stiffness: 500, damping: 30 },
  },
  exit: { opacity: 0, scale: 0.98, transition: { duration: 0.15 } },
};
