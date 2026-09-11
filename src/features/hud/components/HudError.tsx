export interface HudErrorProps {
  readonly message: string;
}

/** The one thing on the overlay that means nothing else on it is true. */
export function HudError({ message }: HudErrorProps) {
  return (
    <div className="hud-error" role="alert">
      <strong>Could not start the renderer</strong>
      <p>{message}</p>
    </div>
  );
}
