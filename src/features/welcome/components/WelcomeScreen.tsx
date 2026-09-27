import { useEffect, useState } from 'react';
import type { ResortParams } from '../../layout/domain/resortGenerator';
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
}

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

function Menu(props: { readonly ready: boolean; readonly onNewGame: () => void }) {
  return (
    <nav className="welcome-menu" aria-label="Main menu">
      <button
        type="button"
        className="welcome-button welcome-button-main"
        disabled={!props.ready}
        onClick={props.onNewGame}
      >
        New game
      </button>
      <button type="button" className="welcome-button" disabled>
        Load game
        <span className="welcome-button-note">Coming soon</span>
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

function Card(props: WelcomeScreenProps & { readonly onNewGame: () => void }) {
  if (props.error) return <Failure message={props.error} />;
  return (
    <>
      <Menu ready={props.ready} onNewGame={props.onNewGame} />
      {props.ready ? null : <LoadingProgress done={props.loaded} />}
    </>
  );
}

function NewGameCard(props: {
  readonly params: ResortParams;
  readonly busy: boolean;
  readonly onStart: WelcomeScreenProps['onStart'];
  readonly onBack: () => void;
}) {
  return (
    <section className="welcome-card welcome-new-game" aria-label="New game">
      <header className="welcome-card-head">
        <h2>New game</h2>
        <button
          type="button"
          className="hud-resort-clear welcome-back"
          disabled={props.busy}
          onClick={props.onBack}
        >
          Back
        </button>
      </header>
      <NewGamePanel params={props.params} onStart={props.onStart} busy={props.busy} />
    </section>
  );
}

function LocalTime() {
  const time = useWallClock();
  return <p className="welcome-clock">The resort runs on your local time, {time}.</p>;
}

function Body(props: WelcomeScreenProps) {
  const [choosing, setChoosing] = useState(false);
  if (choosing && props.params) {
    return (
      <NewGameCard
        params={props.params}
        busy={props.busy}
        onStart={props.onStart}
        onBack={() => setChoosing(false)}
      />
    );
  }
  return (
    <div className="welcome-card">
      <Card {...props} onNewGame={() => setChoosing(true)} />
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
