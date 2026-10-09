import type { PhotoFilterId } from '../domain/photoFilters';

export interface PhotoShot {
  readonly blob: Blob;
  readonly name: string;
}

export type PhotoScale = 1 | 2;

export interface SelfieControls {
  // A followed guest who is drawn: nobody indoors, and nobody out on a craft.
  readonly offered: boolean;
  readonly on: boolean;
  setOn(on: boolean): void;
}

export interface PhotoControls {
  readonly on: boolean;
  enter(): void;
  exit(): void;
  readonly fov: number;
  setFov(degrees: number): void;
  // The hour the sky is drawn at; null is the sim's own, which stands still while photo mode pauses it.
  readonly lookTime: number | null;
  readonly clockTime: number;
  setLookTime(time: number | null): void;
  readonly filter: PhotoFilterId;
  setFilter(filter: PhotoFilterId): void;
  readonly scale: PhotoScale;
  setScale(scale: PhotoScale): void;
  take(): void;
  readonly shot: PhotoShot | null;
  save(): void;
  share(): void;
  readonly canShare: boolean;
  readonly busy: boolean;
  readonly selfie: SelfieControls;
  // A share link that opens on this view, at this hour.
  postcard(): Promise<string>;
}
