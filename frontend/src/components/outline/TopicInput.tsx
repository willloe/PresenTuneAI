import { useEffect, useState } from "react";

export default function TopicInput({
  topic,
  onCommit,
}: {
  topic: string;
  onCommit: (next: string) => void;
}) {
  const [local, setLocal] = useState(topic);
  useEffect(() => setLocal(topic), [topic]);

  const commit = () => {
    if (local !== topic) onCommit(local);
  };

  return (
    <label className="block mb-4">
      <span className="block text-sm mb-1">Topic</span>
      <input
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
        }}
        className="w-full rounded-xl border px-3 py-2 outline-none focus:ring"
        placeholder="What’s this deck about?"
      />
    </label>
  );
}
