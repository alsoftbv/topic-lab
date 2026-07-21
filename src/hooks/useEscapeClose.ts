import { useEffect, useRef } from "react";

const stack: { current: () => void }[] = [];

export function useEscapeClose(onClose: () => void) {
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    stack.push(closeRef);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (stack[stack.length - 1] !== closeRef) return;
      closeRef.current();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      const idx = stack.lastIndexOf(closeRef);
      if (idx !== -1) stack.splice(idx, 1);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);
}
