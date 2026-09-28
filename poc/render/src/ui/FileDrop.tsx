import { useState, type DragEvent, type ReactNode } from 'react';

interface FileDropProps {
  onFile: (file: File) => void;
  children: ReactNode;
}

export function FileDrop({ onFile, children }: FileDropProps) {
  const [isOver, setIsOver] = useState(false);

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsOver(true);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsOver(false);
    const file = e.dataTransfer.files.item(0);
    if (file) {
      onFile(file);
    }
  }

  return (
    <div
      className="dropzone"
      data-over={isOver}
      onDragOver={handleDragOver}
      onDragLeave={() => setIsOver(false)}
      onDrop={handleDrop}
    >
      {children}
    </div>
  );
}
