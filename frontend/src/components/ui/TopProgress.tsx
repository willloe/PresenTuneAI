import { useEffect, useState } from "react";
import { M } from "./Motion";

type Props = { active: boolean };

export default function TopProgress({ active }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (active) setVisible(true);
    else setTimeout(() => setVisible(false), 320); // let fade-out animate
  }, [active]);

  return (
    <M.div
      initial={{ opacity: 0 }}
      animate={{ opacity: active ? 1 : 0 }}
      transition={{ duration: 0.25 }}
      className="pointer-events-none fixed left-0 right-0 top-0 z-[1200]"
      aria-hidden
    >
      {visible && (
        <div className="relative h-[3px] w-full overflow-hidden bg-black/5">
          <M.div
            key={String(active)}
            initial={{ x: "-100%" }}
            animate={{ x: ["-100%", "0%", "100%"] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "linear" }}
            className="absolute inset-y-0 w-1/3 bg-black"
          />
        </div>
      )}
    </M.div>
  );
}
