#!/usr/bin/env python3
"""Signs the Worker in to OneDrive (personal Microsoft account) and stores the refresh token in KV.

Run from worker/:  python3 scripts/connect-onedrive.py
It prints a code to enter at microsoft.com/link, waits for approval, and saves the token
with wrangler. The token is never printed. Needed again only if the Worker reports that the
OneDrive sign-in expired (about 90 days without use).
"""
import json, os, subprocess, sys, tempfile, time, urllib.error, urllib.parse, urllib.request

CLIENT_ID = '34f93536-4f0c-4751-8baf-19967a8a418c'
BASE = 'https://login.microsoftonline.com/consumers/oauth2/v2.0'
SCOPE = 'Files.ReadWrite offline_access User.Read'


def post(url, fields):
    data = urllib.parse.urlencode(fields).encode()
    try:
        return json.load(urllib.request.urlopen(url, data))
    except urllib.error.HTTPError as e:
        return json.load(e)


dc = post(f'{BASE}/devicecode', {'client_id': CLIENT_ID, 'scope': SCOPE})
if 'device_code' not in dc:
    sys.exit(f"Couldn't start sign-in: {dc.get('error_description', dc)}")
print(dc['message'], flush=True)

deadline = time.time() + dc['expires_in']
while time.time() < deadline:
    time.sleep(dc.get('interval', 5))
    tok = post(f'{BASE}/token', {'grant_type': 'urn:ietf:params:oauth:grant-type:device_code', 'client_id': CLIENT_ID, 'device_code': dc['device_code']})
    if tok.get('error') in ('authorization_pending', 'slow_down'):
        continue
    if 'refresh_token' not in tok:
        sys.exit(f"Sign-in failed: {tok.get('error_description', tok)}")
    fd, path = tempfile.mkstemp()
    os.write(fd, tok['refresh_token'].encode())
    os.close(fd)
    for _ in range(5):
        r = subprocess.run(['npx', 'wrangler', 'kv', 'key', 'put', 'ms_refresh_token', '--path', path, '--binding', 'KV', '--remote'], capture_output=True, text=True)
        if r.returncode == 0:
            break
        time.sleep(5)
    if r.returncode != 0:
        sys.exit(f'Signed in, but saving to KV failed. The token is in {path}; retry: npx wrangler kv key put ms_refresh_token --path {path} --binding KV --remote')
    os.remove(path)
    subprocess.run(['npx', 'wrangler', 'kv', 'key', 'delete', 'ms_access', '--binding', 'KV', '--remote'], capture_output=True)
    print('Connected. The Worker can write to your OneDrive again.')
    sys.exit(0)
sys.exit('The code expired. Run the script again.')
