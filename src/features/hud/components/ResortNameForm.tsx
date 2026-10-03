import { useState } from 'react';
import { ResortNameField } from '../../naming/components/ResortNameField';
import { cleanResortName } from '../../naming/domain/resortName';

export interface ResortNameFormProps {
  readonly name: string;
  readonly onRename: (name: string) => void;
}

// An emptied field keeps the name the resort has: a resort is never left without one.
export function ResortNameForm({ name, onRename }: ResortNameFormProps) {
  const [typed, setTyped] = useState(name);
  return (
    <form
      className="hud-resort resort-name-form"
      onSubmit={(event) => {
        event.preventDefault();
        const next = cleanResortName(typed) ?? name;
        setTyped(next);
        onRename(next);
      }}
    >
      <ResortNameField value={typed} onChange={setTyped} />
      <button type="submit" className="hud-resort-go save-button">
        Rename
      </button>
    </form>
  );
}
