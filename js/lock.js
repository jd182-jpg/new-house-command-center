// Password screen shown before the app loads. It keeps casual visitors out; it is not real
// security, since the page and the synced data are both public. Unlocking is remembered per device.
const HASH = '32ea6aa8091a36e8779df25bed19f857a402b1f3862c8c07212928f0f2ea886d';
const KEY = 'nh-unlocked';

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function remembered() {
  try { return localStorage.getItem(KEY) === HASH; } catch { return false; }
}

function start() {
  document.getElementById('lock')?.remove();
  import('./app.js');
}

if (remembered()) start();
else {
  const lock = document.createElement('div');
  lock.id = 'lock';
  lock.innerHTML = `<form class="lock-card">
    <div class="lock-mark" aria-hidden="true"></div>
    <h1>2608 Montrose</h1>
    <p class="muted">Enter the password to open the command center.</p>
    <input type="password" inputmode="numeric" autocomplete="current-password" aria-label="Password" placeholder="Password" required>
    <button class="btn primary" type="submit">Unlock</button>
    <p class="lock-error" role="alert"></p>
  </form>`;
  document.body.append(lock);
  const input = lock.querySelector('input');
  input.focus();
  lock.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if ((await sha256(input.value.trim())) === HASH) {
      try { localStorage.setItem(KEY, HASH); } catch { /* private mode: ask again next time */ }
      start();
    } else {
      lock.querySelector('.lock-error').textContent = 'That password is not right.';
      input.select();
    }
  });
}
