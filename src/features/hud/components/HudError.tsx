export interface HudErrorProps {
  readonly title?: string;
  readonly message: string;
}

export function HudError({ title = 'Could not start the renderer', message }: HudErrorProps) {
  return (
    <div className="ui-panel hud-error" role="alert">
      <strong>{title}</strong>
      <p>{message}</p>
    </div>
  );
}
