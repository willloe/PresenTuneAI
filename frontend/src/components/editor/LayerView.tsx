import { useEffect, useState } from "react";

export function SafeImage({
  src,
  alt,
  fit,
}: {
  src: string;
  alt: string;
  fit: "cover" | "contain" | string;
}) {
  const [ok, setOk] = useState(true);

  // If the src changes, try again
  useEffect(() => {
    setOk(true);
  }, [src]);

  return ok ? (
    <img
      key={src}                    // force remount on url change
      src={src}
      alt={alt}
      style={{
        width: "100%",
        height: "100%",
        objectFit: fit === "contain" ? "contain" : "cover",
        objectPosition: "center",
        display: "block",
        background: "#f3f4f6",
      }}
      loading="lazy"
      decoding="async"
      // Keep these if you need them; they don't hurt if not
      crossOrigin="anonymous"
      referrerPolicy="no-referrer"
      onError={() => setOk(false)}
      onLoad={() => setOk(true)}
    />
  ) : (
    <div
      className="flex items-center justify-center text-[10px] text-gray-500"
      style={{ width: "100%", height: "100%", background: "#eef2ff" }}
      aria-label="image unavailable"
      title="image unavailable"
    >
      image unavailable
    </div>
  );
}
