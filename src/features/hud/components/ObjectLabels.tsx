import { useCallback, type RefObject } from "react";
import type { LabelAnchor } from "../../../app/showcase";

export interface ObjectLabelsProps {
  readonly anchors: readonly LabelAnchor[];
  /**
   * Filled with the rendered label elements so the render loop can position
   * them directly, keeping per-frame work out of React's reconciler.
   */
  readonly elements: RefObject<Map<string, HTMLDivElement>>;
}

const toCssColor = (color: number): string => `#${color.toString(16).padStart(6, "0")}`;

export function ObjectLabels({ anchors, elements }: ObjectLabelsProps) {
  const register = useCallback(
    (id: string) => (element: HTMLDivElement | null) => {
      if (element) {
        elements.current.set(id, element);
      } else {
        elements.current.delete(id);
      }
    },
    [elements],
  );

  return (
    <div className="hud-labels" aria-label="Object labels">
      {anchors.map((anchor) => (
        <div
          key={anchor.id}
          ref={register(anchor.id)}
          className="hud-label"
          style={{ borderColor: toCssColor(anchor.color) }}
        >
          <span className="hud-label-swatch" style={{ background: toCssColor(anchor.color) }} />
          {anchor.label}
        </div>
      ))}
    </div>
  );
}
