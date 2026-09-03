import { useState, useRef, Children, Fragment, isValidElement } from "react";
import { preferences, type DockPosition } from "@/utils/preferences";

const MIN_PANE_WIDTH = 240;
const MIN_PANE_HEIGHT = 160;
const DOCK_HEIGHT = { min: 180, max: 600 };
const DOCK_WIDTH = { min: 280, max: 720 };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

interface DockProps {
  position: DockPosition;
  fill: boolean;
  children: React.ReactNode;
}

function trackMouse(cursor: string, onMove: (e: MouseEvent) => void, onDone: () => void) {
  document.body.style.cursor = cursor;
  document.body.style.userSelect = "none";
  const onMouseUp = () => {
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onMouseUp);
    onDone();
  };
  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onMouseUp);
}

export function Dock({ position, fill, children }: DockProps) {
  const [height, setHeight] = useState(() => preferences.dockHeight);
  const [width, setWidth] = useState(() => preferences.dockWidth);
  const [split, setSplit] = useState(() => preferences.dockSplit);
  const panesRef = useRef<HTMLDivElement>(null);
  const panes = Children.toArray(children).filter(isValidElement);
  const stacked = position !== "top";

  const handleResize = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (position === "top") {
      const startY = e.clientY;
      const startHeight = height;
      let next = height;
      trackMouse(
        "row-resize",
        (e) => {
          next = clamp(startHeight + e.clientY - startY, DOCK_HEIGHT.min, DOCK_HEIGHT.max);
          setHeight(next);
        },
        () => {
          preferences.dockHeight = next;
        }
      );
      return;
    }

    const startX = e.clientX;
    const startWidth = width;
    const dir = position === "left" ? 1 : -1;
    let next = width;
    trackMouse(
      "col-resize",
      (e) => {
        next = clamp(startWidth + (e.clientX - startX) * dir, DOCK_WIDTH.min, DOCK_WIDTH.max);
        setWidth(next);
      },
      () => {
        preferences.dockWidth = next;
      }
    );
  };

  const handleSplit = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const container = panesRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const size = stacked ? rect.height : rect.width;
    const start = stacked ? e.clientY : e.clientX;
    const startSplit = split;
    const minFraction = (stacked ? MIN_PANE_HEIGHT : MIN_PANE_WIDTH) / size;
    let next = split;
    trackMouse(
      stacked ? "row-resize" : "col-resize",
      (e) => {
        const delta = (stacked ? e.clientY : e.clientX) - start;
        next = clamp(
          startSplit + delta / size,
          Math.min(minFraction, 0.5),
          Math.max(1 - minFraction, 0.5)
        );
        setSplit(next);
      },
      () => {
        preferences.dockSplit = next;
      }
    );
  };

  const style: React.CSSProperties = fill ? {} : position === "top" ? { height } : { width };
  const grow = (index: number) => (panes.length === 1 ? 1 : index === 0 ? split : 1 - split);

  return (
    <div className={`dock dock-${position}${fill ? " dock-fill" : ""}`} style={style}>
      <div className="dock-panes" ref={panesRef}>
        {panes.map((pane, i) => (
          <Fragment key={pane.key}>
            {i > 0 && <div className="dock-splitter" onMouseDown={handleSplit} />}
            <div
              className="dock-slot"
              style={{
                flexGrow: grow(i),
                minWidth: stacked ? undefined : MIN_PANE_WIDTH,
                minHeight: stacked ? MIN_PANE_HEIGHT : undefined,
              }}
            >
              {pane}
            </div>
          </Fragment>
        ))}
      </div>
      {!fill && <div className="dock-resize-handle" onMouseDown={handleResize} />}
    </div>
  );
}
