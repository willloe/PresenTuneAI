import { useCallback, useState } from "react";

export function useDropZone(onFiles: (files: FileList | File[]) => void) {
  const [isDragging, setDragging] = useState(false);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setDragging(true);
  }, [isDragging]);

  const onDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // only end if leaving the container entirely
    if ((e.target as HTMLElement) === e.currentTarget) setDragging(false);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    const dt = e.dataTransfer;
    if (!dt) return;
    const files = dt.files && dt.files.length ? dt.files : [];
    if (files && files.length) onFiles(files);
  }, [onFiles]);

  return {
    isDragging,
    zoneProps: { onDragOver, onDragEnter, onDragLeave, onDrop },
  };
}
