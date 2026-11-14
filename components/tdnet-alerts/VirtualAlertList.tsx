"use client";

import { memo, useCallback, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { EnrichedEvent } from "@/lib/tdnet-alerts/types";

interface Props {
  events: EnrichedEvent[];
  scrollRef: RefObject<HTMLDivElement | null>;
  renderCard: (event: EnrichedEvent) => ReactNode;
}

/** Only the window owns scroll updates; the page and PL never render on scroll. */
export default memo(function VirtualAlertList({ events, scrollRef, renderCard }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  const getItemKey = useCallback((index: number) => events[index].id, [events]);
  const virtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: events.length,
    getScrollElement: () => scrollRef.current,
    getItemKey,
    estimateSize: () => 110,
    overscan: 6,
    scrollMargin,
    directDomUpdates: true,
    // Hidden mobile panes report zero heights. Keep their valid size estimates.
    measureElement: (element, _entry, instance) => element.getBoundingClientRect().height
      || instance.measurementsCache[Number(element.dataset.index)]?.size || 110,
  });
  const setRoot = useCallback((element: HTMLDivElement | null) => {
    rootRef.current = element;
    virtualizer.containerRef(element);
  }, [virtualizer]);

  useLayoutEffect(() => {
    const pane = scrollRef.current;
    const root = rootRef.current;
    if (!pane || !root) return;
    let width = pane.clientWidth;
    const update = () => {
      if (!pane.clientHeight) return;
      setScrollMargin(root.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop - pane.clientTop);
      if (width !== pane.clientWidth) {
        width = pane.clientWidth;
        virtualizer.measure();
      }
    };
    update();
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    });
    observer.observe(pane);
    if (root.previousElementSibling) observer.observe(root.previousElementSibling);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [scrollRef, virtualizer]);

  return (
    <div ref={setRoot} className="virtual-alert-list" role="list" aria-label="通知一覧"
      style={{ width: "100%", position: "relative" }}>
      {virtualizer.getVirtualItems().map(item => (
        <div key={item.key} data-index={item.index} data-event-id={events[item.index].id}
          role="listitem" aria-posinset={item.index + 1} aria-setsize={events.length}
          ref={virtualizer.measureElement}
          style={{ position: "absolute", top: 0, left: 0, width: "100%" }}>
          {renderCard(events[item.index])}
        </div>
      ))}
    </div>
  );
});
