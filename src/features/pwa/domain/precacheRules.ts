// The music is nearly a third of the first download and the one sound a player can do without
// offline, so the worker keeps a track only once it has been heard. Matches a bank file name, a
// path in dist/ and the URL the worker sees.
export const STREAMED_MUSIC = /(^|\/)music-[^/]*\.mp3$/;

export const MUSIC_CACHE = 'vox-resort-music';
