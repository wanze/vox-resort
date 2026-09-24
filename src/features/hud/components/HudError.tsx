export interface HudErrorProps {
  readonly message: string;
}

export function HudError({ message }: HudErrorProps) {
  return (
    <div className="hud-error" role="alert">
      <strong>Could not start the renderer</strong>
      <p>{message}</p>
    </div>
  );
}
