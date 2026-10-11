// Press on one item and drag over others to select everything between
// them in display order, like Photos on iPhone; starting from a selected
// item deselects instead. Shift-click selects from the last clicked item.
// The list scrolls itself while the pointer is near its top or bottom.
import { useEffect, useRef, type PointerEvent, type RefObject } from "react";

/** Distance from the list's edge where dragging scrolls it, in pixels. */
const EDGE = 48;
/** Fastest auto-scroll, in pixels per frame. */
const MAX_SPEED = 18;

interface Options {
  /** Selectable ids in display order; each item's element carries its id
   * in `data-select-id`. */
  order: string[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  scroller: RefObject<HTMLElement | null>;
}

interface Drag {
  anchor: number;
  /** Select or deselect what the drag covers. */
  select: boolean;
  /** Selection before the drag; each move recomputes from it. */
  base: Set<string>;
  moved: boolean;
  x: number;
  y: number;
}

export function useDragSelect({ order, selected, onChange, scroller }: Options) {
  const latest = useRef({ order, selected, onChange });
  useEffect(() => {
    latest.current = { order, selected, onChange };
  });
  const drag = useRef<Drag | null>(null);
  const lastClicked = useRef<number | null>(null);
  const frame = useRef(0);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  function apply(from: number, to: number, select: boolean, base: Set<string>) {
    const next = new Set(base);
    const [a, b] = from < to ? [from, to] : [to, from];
    for (const id of latest.current.order.slice(a, b + 1)) {
      if (select) next.add(id);
      else next.delete(id);
    }
    latest.current.onChange(next);
  }

  /** Extends the drag to the item under the pointer, if any. */
  function follow() {
    const d = drag.current;
    if (!d) return;
    const element = document.elementFromPoint(d.x, d.y)?.closest<HTMLElement>("[data-select-id]");
    const index = element ? latest.current.order.indexOf(element.dataset.selectId!) : -1;
    if (index < 0) return;
    if (index !== d.anchor) d.moved = true;
    if (d.moved) apply(d.anchor, index, d.select, d.base);
  }

  function autoScroll() {
    const d = drag.current;
    const list = scroller.current;
    if (!d || !list) return;
    const box = list.getBoundingClientRect();
    const over =
      d.y < box.top + EDGE ? d.y - (box.top + EDGE) : d.y > box.bottom - EDGE ? d.y - (box.bottom - EDGE) : 0;
    if (over !== 0) {
      list.scrollTop += Math.max(-1, Math.min(1, over / EDGE)) * MAX_SPEED;
      follow();
    }
    frame.current = requestAnimationFrame(autoScroll);
  }

  function onPointerDown(id: string, e: PointerEvent) {
    if (e.button !== 0) return;
    const { order, selected } = latest.current;
    const index = order.indexOf(id);
    if (index < 0) return;
    e.preventDefault(); // no text selection or native drag
    if (e.shiftKey && lastClicked.current !== null) {
      apply(lastClicked.current, index, true, selected);
      lastClicked.current = index;
      return;
    }
    drag.current = {
      anchor: index,
      select: !selected.has(id),
      base: new Set(selected),
      moved: false,
      x: e.clientX,
      y: e.clientY,
    };
    const move = (m: globalThis.PointerEvent) => {
      if (!drag.current) return;
      drag.current.x = m.clientX;
      drag.current.y = m.clientY;
      follow();
    };
    const up = () => {
      const d = drag.current;
      drag.current = null;
      cancelAnimationFrame(frame.current);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      // A press without a drag is a plain click: toggle that one item.
      if (d && !d.moved) apply(d.anchor, d.anchor, d.select, d.base);
      lastClicked.current = index;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    frame.current = requestAnimationFrame(autoScroll);
  }

  return { onPointerDown };
}
