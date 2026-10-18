// Cross-device sync settings. While FIREBASE_CONFIG is null the app works exactly as
// before and keeps everything in this browser. Paste your Firebase web app config below
// (README > Turn on sync) and every device that opens the site shares one copy.
//
// These values are not secrets: Firebase web config is meant to ship in public pages.
// Access is controlled by firestore.rules, which only allows the one document below.

export const FIREBASE_CONFIG = null;

// The one Firestore document that holds your data: 96 random bits, so it can't be guessed.
// The app has no login, so anyone who knows this id can read and write the document.
// It's in a public repo, so treat the synced data as not private (that's why Wi-Fi
// passwords stay on each device unless you turn on syncing them in Settings).
export const COLLECTION = 'houses';
export const DOC_ID = 'nh-2658c0461f9e466d1e0b637b';
