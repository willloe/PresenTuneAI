import { useEffect, useState } from "react";
import { api } from "./lib/api";
import { uploadFile } from "./lib/upload";

export default function App() {
  const [health, setHealth] = useState<"checking"|"ok"|"error">("checking");
  const [topic, setTopic] = useState("AI Hackathon");
  const [count, setCount] = useState(5);
  const [slides, setSlides] = useState<{title:string; bullets:string[]}[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  
  // inside component state:
  const [uploadMeta, setUploadMeta] = useState<any>(null);
  const [uploadErr, setUploadErr] = useState<string | null>(null);

  // add an upload handler
  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploadErr(null); setUploadMeta(null);
    try {
      const meta = await uploadFile(f);
      setUploadMeta(meta);
      // optional: seed outline topic with filename
      setTopic(meta.filename.replace(/\.[^.]+$/, ""));
    } catch (err:any) {
      setUploadErr(err.message || "upload failed");
    }
  };

  useEffect(() => {
    api.health().then(() => setHealth("ok")).catch(() => setHealth("error"));
  }, []);

  const runOutline = async () => {
    setErr(null); setSlides(null);
    try {
      const body: any = { topic, slide_count: count };
      if (uploadMeta?.parsed?.text) body.text = uploadMeta.parsed.text;  // <—
      const data = await api.outline(body);
      setSlides(data.slides);
    } catch (e:any) {
      setErr(e.message || "failed");
    }
  };


  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="mx-auto max-w-4xl px-6 py-8">
        <h1 className="text-2xl font-semibold">PresenTuneAI</h1>
        <p className="text-sm text-gray-600">
          API:{" "}
          <span className={health === "ok" ? "text-green-600" : "text-amber-600"}>
            {health === "checking" ? "checking..." : health}
          </span>
        </p>
      </header>

      <main className="mx-auto max-w-4xl px-6">
        <section className="rounded-2xl bg-white shadow-sm p-6 mb-6">
          <h2 className="text-lg font-medium mb-4">Upload</h2>
          <input type="file" accept=".pdf,.docx,.txt" onChange={onPick}
                className="block w-full rounded-xl border px-3 py-2" />
          {uploadErr && <p className="mt-2 text-sm text-red-600">{uploadErr}</p>}
          {uploadMeta && (
            <div className="mt-3 text-sm">
              <div className="font-medium">{uploadMeta.filename}</div>
              <div className="text-gray-600">
                {Math.round(uploadMeta.size/1024)} KB • {uploadMeta.content_type} • kind: {uploadMeta.parsed.kind} • pages: {uploadMeta.parsed.pages}
              </div>
              <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-gray-50 p-3 border">
                {uploadMeta.parsed.text_preview}
              </pre>
            </div>
          )}
        </section>
        <section className="rounded-2xl bg-white shadow-sm p-6 mb-6">
          <h2 className="text-lg font-medium mb-4">Generate Outline (stub)</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="sm:col-span-2">
              <span className="block text-sm mb-1">Topic</span>
              <input value={topic} onChange={e=>setTopic(e.target.value)}
                className="w-full rounded-xl border px-3 py-2 outline-none focus:ring" />
            </label>
            <label>
              <span className="block text-sm mb-1">Slide count</span>
              <input type="number" min={1} max={15} value={count}
                onChange={e=>setCount(Number(e.target.value))}
                className="w-full rounded-xl border px-3 py-2 outline-none focus:ring" />
            </label>
          </div>
          <button onClick={runOutline}
            className="mt-4 rounded-xl bg-black text-white px-4 py-2 hover:opacity-90">
            Generate
          </button>
          {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
        </section>

        {!!slides && (
          <section className="rounded-2xl bg-white shadow-sm p-6">
            <h3 className="text-base font-medium mb-4">Preview</h3>
            <ul className="space-y-3">
              {slides.map((s, i) => (
                <li key={i} className="border rounded-xl p-4">
                  <div className="font-semibold">{s.title}</div>
                  <ul className="list-disc ml-6">
                    {s.bullets.map((b, j) => <li key={j}>{b}</li>)}
                  </ul>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
