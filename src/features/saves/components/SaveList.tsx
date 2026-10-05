import { useState } from 'react';
import { isReadable, type ListedSave } from '../domain/saveSlots';
import { titleOf } from '../domain/saveWords';
import type { SaveMeta } from '../domain/snapshot';
import { summaryOf } from './saveNames';

export interface SaveListProps {
  readonly saves: readonly ListedSave[];
  readonly currentId: string | null;
  readonly busy: boolean;
  // The save being opened, whose button says so until the game shows.
  readonly loading?: string | null;
  readonly now: number;
  readonly onLoad: (id: string) => void;
  readonly onDelete: (id: string) => void;
}

// Asked in the row rather than in a dialog: the list is the one place a save can be deleted.
function DeleteButton(props: { readonly disabled: boolean; readonly onDelete: () => void }) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button
        type="button"
        className="hud-resort-clear save-button"
        disabled={props.disabled}
        onClick={() => setAsking(true)}
      >
        Delete
      </button>
    );
  }
  return (
    <span className="save-confirm" role="group" aria-label="Delete this save?">
      <span>Delete?</span>
      <button type="button" className="hud-resort-clear save-button" onClick={props.onDelete}>
        Yes
      </button>
      <button
        type="button"
        className="hud-resort-clear save-button"
        onClick={() => setAsking(false)}
      >
        No
      </button>
    </span>
  );
}

function SaveRow(
  props: Omit<SaveListProps, 'saves' | 'currentId'> & {
    readonly meta: SaveMeta;
    readonly current: boolean;
  },
) {
  const { meta } = props;
  return (
    <li className="save-row" data-current={props.current ? '' : undefined}>
      <span className="save-row-text">
        <span className="save-row-name">
          {titleOf(meta)}
          {props.current ? <span className="save-row-current">current</span> : null}
        </span>
        <span className="save-row-note">{summaryOf(meta, props.now)}</span>
      </span>
      <span className="save-row-actions">
        <button
          type="button"
          className="hud-resort-go save-button"
          disabled={props.busy}
          aria-busy={props.loading === meta.id}
          onClick={() => props.onLoad(meta.id)}
        >
          {props.loading === meta.id ? 'Loading…' : 'Load'}
        </button>
        <DeleteButton disabled={props.busy} onDelete={() => props.onDelete(meta.id)} />
      </span>
    </li>
  );
}

function UnreadableRow(props: {
  readonly id: string;
  readonly busy: boolean;
  readonly onDelete: (id: string) => void;
}) {
  return (
    <li className="save-row" data-unreadable="">
      <span className="save-row-text">
        <span className="save-row-name">Can't be read</span>
        <span className="save-row-note">saved by another version, or damaged</span>
      </span>
      <span className="save-row-actions">
        <DeleteButton disabled={props.busy} onDelete={() => props.onDelete(props.id)} />
      </span>
    </li>
  );
}

export function SaveList(props: SaveListProps) {
  if (props.saves.length === 0) return <p className="save-empty">No saved games yet.</p>;
  return (
    <ul className="save-list">
      {props.saves.map((save) =>
        isReadable(save) ? (
          <SaveRow key={save.id} {...props} meta={save} current={save.id === props.currentId} />
        ) : (
          <UnreadableRow key={save.id} id={save.id} busy={props.busy} onDelete={props.onDelete} />
        ),
      )}
    </ul>
  );
}
