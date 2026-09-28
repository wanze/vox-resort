import { useEffect, useState } from 'react';
import type { ResortParams } from '../../layout/domain/resortGenerator';
import { SaveList } from '../../saves/components/SaveList';
import { latestOf, listOrder, readableById, UNSAVED_ID } from '../../saves/domain/saveSlots';
import { titleOf } from '../../saves/domain/saveWords';
import type { SaveMeta } from '../../saves/domain/snapshot';
import type { SaveControls } from '../../../app/useSaves';
import type { LoadingStep } from '../domain/loading';
import type { NewGame } from '../domain/newGame';
import { LoadingProgress } from './LoadingProgress';
import { NewGamePanel } from './NewGamePanel';

export interface WelcomeScreenProps {
  readonly loaded: readonly LoadingStep[];
  readonly ready: boolean;
  readonly error: string | null;
  readonly params: ResortParams | null;
  readonly busy: boolean;
  readonly onStart: (params: ResortParams, game: NewGame) => void;
  readonly saves: SaveControls;
  readonly onLoad: (id: string) => void;
}

type Choice = 'menu' | 'new' | 'load';

const timeNow = (): string =>
  new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

// Checked every few seconds rather than timed to the minute: a sleeping laptop wakes up late.
function useWallClock(): string {
  const [time, setTime] = useState(timeNow);
  useEffect(() => {
    const timer = globalThis.setInterval(() => setTime(timeNow()), 5000);
    return () => globalThis.clearInterval(timer);
  }, []);
  return time;
}

// Picking up where the player left off is the likelier wish, so it takes the main button.
function ContinueButton(props: {
  readonly latest: SaveMeta;
  readonly ready: boolean;
  readonly onLoad: (id: string) => void;
}) {
  return (
    <button
      type="button"
      className="welcome-button welcome-button-main welcome-continue"
      disabled={!props.ready}
      onClick={() => props.onLoad(props.latest.id)}
    >
      Continue
      <span className="welcome-button-note">
        {titleOf(props.latest)}, day {props.latest.day}
      </span>
    </button>
  );
}

function Menu(props: {
  readonly ready: boolean;
  readonly latest: SaveMeta | null;
  readonly onChoose: (choice: Choice) => void;
  readonly onLoad: (id: string) => void;
}) {
  const { latest } = props;
  return (
    <nav className="welcome-menu" aria-label="Main menu">
      {latest ? <ContinueButton latest={latest} ready={props.ready} onLoad={props.onLoad} /> : null}
      <button
        type="button"
        className={latest ? 'welcome-button' : 'welcome-button welcome-button-main'}
        disabled={!props.ready}
        onClick={() => props.onChoose('new')}
      >
        New game
      </button>
      <button
        type="button"
        className="welcome-button"
        disabled={!props.ready}
        onClick={() => props.onChoose('load')}
      >
        Load game
      </button>
    </nav>
  );
}

function Failure({ message }: { readonly message: string }) {
  return (
    <div className="welcome-failure" role="alert">
      <strong>The resort could not be drawn</strong>
      <p>{message}</p>
      <p>Try a browser with WebGPU or WebGL 2 turned on, then reload the page.</p>
    </div>
  );
}

function Card(props: WelcomeScreenProps & { readonly onChoose: (choice: Choice) => void }) {
  if (props.error) return <Failure message={props.error} />;
  return (
    <>
      <Menu
        ready={props.ready}
        latest={latestOf(props.saves.saves)}
        onChoose={props.onChoose}
        onLoad={props.onLoad}
      />
      {props.ready ? null : <LoadingProgress done={props.loaded} />}
    </>
  );
}

function CardHead(props: {
  readonly title: string;
  readonly busy: boolean;
  readonly onBack: () => void;
}) {
  return (
    <header className="welcome-card-head">
      <h2>{props.title}</h2>
      <button
        type="button"
        className="hud-resort-clear welcome-back"
        disabled={props.busy}
        onClick={props.onBack}
      >
        Back
      </button>
    </header>
  );
}

function NewGameCard(props: {
  readonly params: ResortParams;
  readonly busy: boolean;
  readonly onStart: WelcomeScreenProps['onStart'];
  readonly saves: SaveControls;
  readonly onBack: () => void;
}) {
  return (
    <section className="welcome-card welcome-new-game" aria-label="New game">
      <CardHead title="New game" busy={props.busy} onBack={props.onBack} />
      <NewGamePanel
        params={props.params}
        onStart={props.onStart}
        busy={props.busy}
        unsaved={readableById(props.saves.saves, UNSAVED_ID)}
        onKeepUnsaved={props.saves.nameUnsaved}
      />
    </section>
  );
}

// Loading waits for the scene as a new game does: there is nothing to load into before it.
function LoadGameCard(props: {
  readonly saves: SaveControls;
  readonly ready: boolean;
  readonly busy: boolean;
  readonly onLoad: (id: string) => void;
  readonly onBack: () => void;
}) {
  const { saves } = props;
  const [now] = useState(Date.now);
  const blocked = props.busy || !props.ready || saves.status === 'saving';
  return (
    <section className="welcome-card welcome-load-game" aria-label="Load game">
      <CardHead title="Load game" busy={props.busy} onBack={props.onBack} />
      {saves.available ? (
        <SaveList
          saves={listOrder(saves.saves)}
          currentId={null}
          busy={blocked}
          now={now}
          onLoad={props.onLoad}
          onDelete={(id) => void saves.remove(id)}
        />
      ) : (
        <p className="save-empty">Saving is not available in this browser.</p>
      )}
    </section>
  );
}

function LocalTime() {
  const time = useWallClock();
  return <p className="welcome-clock">The resort runs on your local time, {time}.</p>;
}

function Body(props: WelcomeScreenProps) {
  const [choice, setChoice] = useState<Choice>('menu');
  const back = (): void => setChoice('menu');
  if (choice === 'new' && props.params) {
    return (
      <NewGameCard
        params={props.params}
        busy={props.busy}
        onStart={props.onStart}
        saves={props.saves}
        onBack={back}
      />
    );
  }
  if (choice === 'load') {
    return (
      <LoadGameCard
        saves={props.saves}
        ready={props.ready}
        busy={props.busy}
        onLoad={props.onLoad}
        onBack={back}
      />
    );
  }
  return (
    <div className="welcome-card">
      <Card {...props} onChoose={setChoice} />
    </div>
  );
}

export function WelcomeScreen(props: WelcomeScreenProps) {
  return (
    <div className="welcome" data-ready={props.ready ? '' : undefined}>
      <div className="welcome-column">
        <h1 className="welcome-wordmark">Vox Resort</h1>
        <p className="welcome-tagline">Build a seaside resort, block by block.</p>
        <Body {...props} />
      </div>
      {props.ready ? <LocalTime /> : null}
    </div>
  );
}
