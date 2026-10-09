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
  if (!reply.asks) return <p className="ui-note">{reply.text}</p>;
  return (
    <div className="ui-note saves-confirm" role="alert">
      <span>{reply.text}</span>
      <button
        type="button"
        className="ui-button-secondary ui-button-compact"
        onClick={props.onReplace}
      >
        Replace
      </button>
      <button
        type="button"
        className="ui-button-secondary ui-button-compact"
        onClick={props.onCancel}
      >
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
      className="saves-form"
      onSubmit={(event) => {
        event.preventDefault();
        run(0, false);
      }}
    >
      <input
        type="text"
        value={name}
        maxLength={40}
        placeholder="Name this game"
        aria-label="Name of the save"
        onChange={(event) => {
          setName(event.target.value);
          setAnswer(null);
        }}
      />
      <div className="ui-columns">
        {actions.map((action, index) => (
          <button
            key={action.label}
            type={index === 0 ? 'submit' : 'button'}
            className={
              index === 0
                ? 'ui-button-primary ui-button-compact'
                : 'ui-button-secondary ui-button-compact'
            }
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
