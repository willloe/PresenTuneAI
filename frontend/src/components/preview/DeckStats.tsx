type Props = {
  theme: string;
  slideCount: number;
  requestId?: string | null;
};

export default function DeckStats({ theme, slideCount, requestId }: Props) {
  return (
    <>
      <span className="opacity-80">Theme:</span>{" "}
      <span className="font-medium">{theme || "default"}</span>
      <span className="mx-2 opacity-50">•</span>
      <span className="opacity-80">Slides:</span>{" "}
      <span className="font-medium">{slideCount}</span>
      {requestId ? (
        <span className="ml-2 inline-block rounded bg-gray-100 text-gray-700 px-2 py-0.5">
          req: {requestId}
        </span>
      ) : null}
    </>
  );
}
