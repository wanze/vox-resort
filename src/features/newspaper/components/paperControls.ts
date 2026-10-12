import type { Edition } from '../domain/edition';

export interface OpenPaper {
  readonly edition: Edition;
  // The stored colour photo; null for an edition printed without one.
  readonly photo: Blob | null;
  // False when the archive could not keep it: it is shown, but gone once closed.
  readonly kept: boolean;
  // Opened from the Season window's archive, so it steps to the editions beside it.
  readonly browsing: boolean;
}

export interface PaperControls {
  // Oldest first, without their photos.
  readonly editions: readonly Edition[];
  readonly open: OpenPaper | null;
  read(season: number): void;
  close(): void;
  // An object URL of the photo as printed at this width; the caller revokes it.
  print(photo: Blob, width: number): Promise<string>;
}

export interface PhotoCallControls {
  // The season whose last evening it is; null when nothing is asked.
  readonly season: number | null;
  take(): void;
  skip(): void;
}
