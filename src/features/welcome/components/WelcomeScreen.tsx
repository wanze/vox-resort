import { useEffect, useRef, useState } from 'react';
import type { ResortParams } from '../../layout/domain/resortGenerator';
import { SaveList } from '../../saves/components/SaveList';
import {
  latestOf,
  listOrder,
  readableById,
  slotsBusy,
  UNSAVED_ID,
} from '../../saves/domain/saveSlots';
import { resortOf } from '../../saves/components/saveNames';
import { titleOf } from '../../saves/domain/saveWords';
import type { SaveMeta } from '../../saves/domain/snapshot';
import { SharedResortCard } from '../../sharing/components/SharedResortCard';
import type { SharedResort } from '../../sharing/domain/sharedResort';
import type { LoadingStep } from '../domain/loading';
import type { NewGame } from '../domain/newGame';
import { LoadingProgress } from './LoadingProgress';
import { NewGamePanel } from './NewGamePanel';
import type { SaveControls } from '../../saves/components/saveControls';
import type { IncomingShare } from '../../sharing/components/incomingShare';

export interface WelcomeScreenProps {
  readonly loaded: readonly LoadingStep[];
  readonly ready: boolean;
  readonly error: string | null;
  readonly params: ResortParams | null;
  readonly busy: boolean;
  readonly onStart: (params: ResortParams, game: NewGame) => void;
  readonly saves: SaveControls;
  readonly onLoad: (id: string) => void;
  // A resort link the page was opened with, if any.
  readonly shared: IncomingShare | null;
  readonly sharedFailed: boolean;
  readonly onOpenShared: (shared: SharedResort) => void;
  readonly onDismissShared: () => void;
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
  readonly loading: boolean;
  readonly onLoad: (id: string) => void;
}) {
  return (
    <button
      type="button"
      className="welcome-button welcome-button-main welcome-continue"
      disabled={!props.ready || props.loading}
      aria-busy={props.loading}
      onClick={() => props.onLoad(props.latest.id)}
    >
      {props.loading ? 'Loading…' : 'Continue'}
      <span className="welcome-button-note">
        {[...resortOf(props.latest), titleOf(props.latest)].join(' · ')}, day {props.latest.day}
      </span>
    </button>
  );
}

function Menu(props: {
  readonly ready: boolean;
  readonly loading: string | null;
  readonly latest: SaveMeta | null;
  readonly onChoose: (choice: Choice) => void;
  readonly onLoad: (id: string) => void;
  readonly returnTo: Choice | null;
}) {
  const { latest } = props;
  const free = props.ready && props.loading === null;
  return (
    <nav className="welcome-menu" aria-label="Main menu">
      {latest ? (
        <ContinueButton
          latest={latest}
          ready={props.ready}
          loading={props.loading !== null}
          onLoad={props.onLoad}
        />
      ) : null}
      <button
        type="button"
        className={latest ? 'welcome-button' : 'welcome-button welcome-button-main'}
        disabled={!free}
        autoFocus={props.returnTo === 'new'}
        onClick={() => props.onChoose('new')}
      >
        New game
      </button>
      <button
        type="button"
        className="welcome-button"
        disabled={!free}
        autoFocus={props.returnTo === 'load'}
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

const LINK_NOTICES: { readonly [kind in IncomingShare['kind']]: string | null } = {
  loading: null,
  ready: null,
  unreadable: 'This resort link could not be read.',
  newer: 'This resort link was made by a newer version of the game. Reload to update.',
};

function LinkNotice({ shared }: { readonly shared: IncomingShare }) {
  const notice = LINK_NOTICES[shared.kind];
  return notice === null ? null : (
    <p className="welcome-link-notice" role="alert">
      {notice}
    </p>
  );
}

// A link opened with the page takes the menu's place, so a player who already chose to start
// or load is not pulled away.
interface ChoiceProps extends WelcomeScreenProps {
  readonly onChoose: (choice: Choice) => void;
  // The card the player came back from, whose button takes the keyboard again.
  readonly returnTo: Choice | null;
}

function Choices(props: ChoiceProps) {
  const { shared } = props;
  if (shared?.kind === 'ready') {
    return (
      <SharedResortCard
        shared={shared.shared}
        ready={props.ready}
        busy={props.busy}
        failed={props.sharedFailed}
        unsaved={readableById(props.saves.saves, UNSAVED_ID)}
        onKeepUnsaved={props.saves.nameUnsaved}
        onOpen={props.onOpenShared}
        onBack={props.onDismissShared}
      />
    );
  }
  return (
    <>
      {shared ? <LinkNotice shared={shared} /> : null}
      <Menu
        ready={props.ready}
        loading={props.saves.loading}
        latest={latestOf(props.saves.saves)}
        onChoose={props.onChoose}
        onLoad={props.onLoad}
        returnTo={props.returnTo}
      />
    </>
  );
}

function Card(props: ChoiceProps) {
  if (props.error) return <Failure message={props.error} />;
  return (
    <>
      <Choices {...props} />
      {props.ready ? null : <LoadingProgress done={props.loaded} />}
    </>
  );
}

function CardHead(props: {
  readonly title: string;
  readonly busy: boolean;
  readonly onBack: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  // The button that opened the card is gone, so the keyboard starts at its heading.
  useEffect(() => heading.current?.focus(), []);
  return (
    <header className="welcome-card-head">
      <h2 ref={heading} tabIndex={-1}>
        {props.title}
      </h2>
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
  const blocked = props.busy || !props.ready || slotsBusy(saves);
  return (
    <section className="welcome-card welcome-load-game" aria-label="Load game">
      <CardHead title="Load game" busy={blocked} onBack={props.onBack} />
      {saves.available ? (
        <SaveList
          saves={listOrder(saves.saves)}
          currentId={null}
          busy={blocked}
          loading={saves.loading}
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
  const [from, setFrom] = useState<Choice | null>(null);
  const back = (): void => {
    setFrom(choice);
    setChoice('menu');
  };
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
      <Card {...props} onChoose={setChoice} returnTo={from} />
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
