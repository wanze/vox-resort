import { useState } from 'react';
import type { SaveOutcome } from '../domain/saveSlots';
import { replyFor } from '../domain/saveWords';

export interface NameAction {
  readonly label: string;
  readonly run: (name: string, overwrite: boolean) => Promise<SaveOutcome>;
}

export interface NameFormProps {
  readonly initial: string;
  // The first is what Enter does.
  readonly actions: readonly NameAction[];
  readonly disabled: boolean;
}

interface Answer {
  readonly outcome: SaveOutcome;
  readonly action: number;
}

// A clash is answered in place: replacing the other save is the same action again, told to.
function Reply(props: {
  readonly outcome: SaveOutcome | null;
  readonly onReplace: () => void;
  readonly onCancel: () => void;
}) {
  const reply = replyFor(props.outcome);
  if (!reply) return null;
  if (!reply.asks) return <p className="save-reply">{reply.text}</p>;
  return (
    <div className="save-reply save-confirm" role="alert">
      <span>{reply.text}</span>
      <button type="button" className="hud-resort-clear save-button" onClick={props.onReplace}>
        Replace
      </button>
      <button type="button" className="hud-resort-clear save-button" onClick={props.onCancel}>
        Cancel
      </button>
    </div>
  );
}

export function NameForm({ initial, actions, disabled }: NameFormProps) {
  const [name, setName] = useState(initial);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const run = (action: number, overwrite: boolean): void =>
    void actions[action]!.run(name, overwrite).then((outcome) => setAnswer({ outcome, action }));

  return (
    <form
      className="save-form"
      onSubmit={(event) => {
        event.preventDefault();
        run(0, false);
      }}
    >
      <input
        type="text"
        className="save-name"
        value={name}
        maxLength={40}
        placeholder="Name this game"
        aria-label="Name of the save"
        onChange={(event) => {
          setName(event.target.value);
          setAnswer(null);
        }}
      />
      <div className="save-form-actions">
        {actions.map((action, index) => (
          <button
            key={action.label}
            type={index === 0 ? 'submit' : 'button'}
            className={index === 0 ? 'hud-resort-go save-button' : 'hud-resort-clear save-button'}
            disabled={disabled}
            onClick={index === 0 ? undefined : () => run(index, false)}
          >
            {action.label}
          </button>
        ))}
      </div>
      <Reply
        outcome={answer?.outcome ?? null}
        onReplace={() => run(answer?.action ?? 0, true)}
        onCancel={() => setAnswer(null)}
      />
    </form>
  );
}
