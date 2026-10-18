// Cross-device sync settings. Set FIREBASE_CONFIG to null to go back to keeping
// everything in this one browser. With it filled in, every device shares one copy.
//
// These values are not secrets: Firebase web config is meant to ship in public pages.
// Access is controlled by firestore.rules, which only allows the one document below.

export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyAeQRJt3hCkVVU8QrjyqSVwbDP_LyjhwZU',
  authDomain: 'home-f9ba8.firebaseapp.com',
  projectId: 'home-f9ba8',
  storageBucket: 'home-f9ba8.firebasestorage.app',
  messagingSenderId: '293620260157',
  appId: '1:293620260157:web:0876c5106d1ab8faadb954',
};

// The one Firestore document that holds your data: 96 random bits, so it can't be guessed.
// The app has no login, so anyone who knows this id can read and write the document.
// It's in a public repo, so treat the synced data as not private (that's why Wi-Fi
// passwords stay on each device unless you turn on syncing them in Settings).
export const COLLECTION = 'houses';
export const DOC_ID = 'nh-2658c0461f9e466d1e0b637b';
