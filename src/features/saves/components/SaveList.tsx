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
  // For the welcome card, which has no scrolling body of its own as a window does.
  readonly scroll?: boolean;
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
        className="ui-button-secondary ui-button-compact"
        disabled={props.disabled}
        onClick={() => setAsking(true)}
      >
        Delete
      </button>
    );
  }
  return (
    <span className="saves-confirm" role="group" aria-label="Delete this save?">
      <span>Delete?</span>
      <button
        type="button"
        className="ui-button-secondary ui-button-compact"
        onClick={props.onDelete}
      >
        Yes
      </button>
      <button
        type="button"
        className="ui-button-secondary ui-button-compact"
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
    <li className="saves-row" data-current={props.current ? '' : undefined}>
      <span className="saves-row-text">
        <span className="saves-row-name">
          {titleOf(meta)}
          {props.current ? <span className="saves-row-current">current</span> : null}
        </span>
        <span className="saves-row-note">{summaryOf(meta, props.now)}</span>
      </span>
      <span className="saves-row-actions">
        <button
          type="button"
          className="ui-button-primary ui-button-compact"
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
    <li className="saves-row" data-unreadable="">
      <span className="saves-row-text">
        <span className="saves-row-name">Can't be read</span>
        <span className="saves-row-note">saved by another version, or damaged</span>
      </span>
      <span className="saves-row-actions">
        <DeleteButton disabled={props.busy} onDelete={() => props.onDelete(props.id)} />
      </span>
    </li>
  );
}

export function SaveList(props: SaveListProps) {
  if (props.saves.length === 0) return <p className="ui-note">No saved games yet.</p>;
  return (
    <ul className={props.scroll ? 'saves-list saves-list--scroll' : 'saves-list'}>
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
