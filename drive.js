/* drive.js — Google Drive 雲端存檔（appDataFolder：隱藏的應用程式空間，不佔用戶雲端硬碟版面）。
   C.DRIVE_CLIENT_ID 為空時整組功能隱藏。用 GIS token client＋fetch REST，不載 gapi。 */

const Drive = {};

(() => {
  const FILE_NAME = 'terrarium_bottles.json';
  const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
  let token = null;

  Drive.enabled = !!(typeof C !== 'undefined' && C.DRIVE_CLIENT_ID);

  function ensureGis(cb) {
    if (window.google?.accounts?.oauth2) return cb(true);
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.onload = () => cb(true);
    s.onerror = () => cb(false);
    document.head.appendChild(s);
  }

  /* 取授權（彈 Google 登入視窗）；cb(true|false) */
  Drive.auth = function (cb) {
    if (!Drive.enabled) return cb(false);
    if (token) return cb(true);
    ensureGis(ok => {
      if (!ok) return cb(false);
      try {
        const tc = google.accounts.oauth2.initTokenClient({
          client_id: C.DRIVE_CLIENT_ID,
          scope: SCOPE,
          callback: t => {
            if (t && t.access_token) { token = t.access_token; cb(true); }
            else cb(false);
          },
          error_callback: () => cb(false),
        });
        tc.requestAccessToken();
      } catch (e) { cb(false); }
    });
  };

  const H = () => ({ Authorization: 'Bearer ' + token });

  async function findFile() {
    const q = encodeURIComponent(`name='${FILE_NAME}'`);
    const r = await fetch(
      `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id,modifiedTime)`,
      { headers: H() });
    if (!r.ok) throw new Error('drive list ' + r.status);
    const j = await r.json();
    return j.files?.[0] || null;
  }

  Drive.upload = async function (payload) {
    const body = JSON.stringify(payload);
    const f = await findFile();
    if (f) {
      const r = await fetch(
        `https://www.googleapis.com/upload/drive/v3/files/${f.id}?uploadType=media`,
        { method: 'PATCH', headers: { ...H(), 'Content-Type': 'application/json' }, body });
      if (!r.ok) throw new Error('drive update ' + r.status);
    } else {
      const boundary = 'terrarium' + Date.now().toString(36);
      const multipart =
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
        JSON.stringify({ name: FILE_NAME, parents: ['appDataFolder'] }) +
        `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n` +
        body + `\r\n--${boundary}--`;
      const r = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
        { method: 'POST',
          headers: { ...H(), 'Content-Type': `multipart/related; boundary=${boundary}` },
          body: multipart });
      if (!r.ok) throw new Error('drive create ' + r.status);
    }
    return true;
  };

  Drive.download = async function () {
    const f = await findFile();
    if (!f) return null;
    const r = await fetch(
      `https://www.googleapis.com/drive/v3/files/${f.id}?alt=media`, { headers: H() });
    if (!r.ok) throw new Error('drive get ' + r.status);
    return await r.json();
  };
})();

if (typeof window !== 'undefined') window.Drive = Drive;
