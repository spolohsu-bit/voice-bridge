import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {
  getDatabase,
  ref,
  push,
  set,
  remove,
  onChildAdded,
  onValue,
  query,
  limitToLast,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js';

const SESSION_KEY = 'voiceBridgeSession';
const MESSAGE_LIMIT = 20;

const firebaseConfig = window.VOICE_BRIDGE_FIREBASE_CONFIG || {};
const hasConfig = Boolean(firebaseConfig.apiKey && firebaseConfig.databaseURL);
const app = hasConfig ? initializeApp(firebaseConfig) : null;
const database = app ? getDatabase(app) : null;

const state = {
  mode: getMode(),
  session: getSession(),
  autoCopy: false,
  latestText: '',
  seen: new Set()
};

const $ = (id) => document.getElementById(id);

init();

function init() {
  $('sessionLabel').textContent = state.session;

  if (!hasConfig) {
    $('configWarning').classList.remove('hidden');
  }

  if (state.mode === 'send') {
    initSender();
    return;
  }

  initReceiver();
}

function getMode() {
  const params = new URLSearchParams(window.location.search);
  return params.get('mode') === 'send' ? 'send' : 'receive';
}

function getSession() {
  const params = new URLSearchParams(window.location.search);
  const fromUrl = sanitizeSession(params.get('session'));
  if (fromUrl) {
    window.localStorage.setItem(SESSION_KEY, fromUrl);
    return fromUrl;
  }

  const existing = sanitizeSession(window.localStorage.getItem(SESSION_KEY));
  if (existing) {
    return existing;
  }

  const created = makeSession();
  window.localStorage.setItem(SESSION_KEY, created);
  return created;
}

function initSender() {
  $('modeLabel').textContent = 'Phone sender';
  $('senderView').classList.remove('hidden');
  $('sendButton').addEventListener('click', sendText);
  $('clearInputButton').addEventListener('click', () => {
    $('sendText').value = '';
    $('sendText').focus();
  });
  $('openReceiverButton').addEventListener('click', () => {
    window.open(makeReceiverUrl(), '_blank');
  });
}

function initReceiver() {
  $('modeLabel').textContent = 'Windows receiver';
  $('receiverView').classList.remove('hidden');

  const phoneUrl = makeSenderUrl();
  $('sendLink').textContent = phoneUrl;
  $('qrImage').src = 'https://quickchart.io/qr?size=320&text=' + encodeURIComponent(phoneUrl);

  $('enableCopyButton').addEventListener('click', enableAutoCopy);
  $('copyLatestButton').addEventListener('click', () => copyText(state.latestText));
  $('copyLinkButton').addEventListener('click', () => copyText(phoneUrl));
  $('clearSessionButton').addEventListener('click', clearSession);

  if (!database) {
    setReceiveStatus('Firebase config is missing.', true);
    return;
  }

  subscribeToMessages();
}

async function enableAutoCopy() {
  state.autoCopy = true;
  setReceiveStatus('Auto copy enabled. Send text from the phone, then paste with Ctrl+V.');

  if (state.latestText) {
    await copyText(state.latestText);
  }
}

async function sendText() {
  const text = $('sendText').value.trim();
  if (!text) {
    setSendStatus('Nothing to send.', true);
    return;
  }

  if (!database) {
    setSendStatus('Firebase config is missing.', true);
    return;
  }

  $('sendButton').disabled = true;
  setSendStatus('Sending...');

  try {
    const messageRef = push(ref(database, `sessions/${state.session}/messages`));
    await set(messageRef, {
      text,
      createdAt: serverTimestamp(),
      clientTime: Date.now()
    });
    await set(ref(database, `sessions/${state.session}/updatedAt`), serverTimestamp());
    $('sendText').value = '';
    setSendStatus('Sent.');
    $('sendText').focus();
  } catch (error) {
    setSendStatus(error.message || String(error), true);
  } finally {
    $('sendButton').disabled = false;
  }
}

function subscribeToMessages() {
  setReceiveStatus('Listening for phone text...');

  const messagesRef = query(
    ref(database, `sessions/${state.session}/messages`),
    limitToLast(MESSAGE_LIMIT)
  );

  onChildAdded(messagesRef, async (snapshot) => {
    if (state.seen.has(snapshot.key)) {
      return;
    }

    state.seen.add(snapshot.key);
    const message = snapshot.val();
    if (!message || !message.text) {
      return;
    }

    await addMessage(snapshot.key, message);
  }, (error) => {
    setReceiveStatus(error.message || String(error), true);
  });

  onValue(ref(database, `.info/connected`), (snapshot) => {
    if (snapshot.val() === true && !state.latestText) {
      setReceiveStatus('Listening for phone text...');
    }
  });
}

async function addMessage(id, message) {
  const text = String(message.text || '');
  state.latestText = text;
  $('latestText').value = text;

  const node = document.createElement('article');
  node.className = 'message';
  node.dataset.id = id;

  const time = document.createElement('time');
  time.textContent = formatTime(message.createdAt || message.clientTime || Date.now());
  node.appendChild(time);
  node.appendChild(document.createTextNode(text));

  const messages = $('messages');
  messages.prepend(node);

  while (messages.children.length > MESSAGE_LIMIT) {
    messages.removeChild(messages.lastElementChild);
  }

  if (state.autoCopy) {
    await copyText(text);
    return;
  }

  setReceiveStatus('Received. Press Enable auto copy or Copy latest.');
}

async function clearSession() {
  if (!database) {
    setReceiveStatus('Firebase config is missing.', true);
    return;
  }

  try {
    await remove(ref(database, `sessions/${state.session}/messages`));
    $('messages').innerHTML = '';
    $('latestText').value = '';
    state.latestText = '';
    state.seen.clear();
    setReceiveStatus('Session cleared.');
  } catch (error) {
    setReceiveStatus(error.message || String(error), true);
  }
}

async function copyText(text) {
  if (!text) {
    setReceiveStatus('No text to copy yet.', true);
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    setReceiveStatus('Copied. Paste with Ctrl+V.');
    return;
  } catch (error) {
    if (copyWithSelection(text)) {
      setReceiveStatus('Copied. Paste with Ctrl+V.');
      return;
    }

    selectLatestText(text);
    setReceiveStatus('Clipboard blocked. Press Ctrl+C, then paste with Ctrl+V.', true);
  }
}

function copyWithSelection(text) {
  selectLatestText(text);

  try {
    return document.execCommand('copy');
  } catch (error) {
    return false;
  }
}

function selectLatestText(text) {
  const node = $('latestText');
  node.value = text;
  node.focus();
  node.select();
}

function makeSenderUrl() {
  const url = new URL(window.location.href);
  url.searchParams.set('mode', 'send');
  url.searchParams.set('session', state.session);
  return url.toString();
}

function makeReceiverUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete('mode');
  url.searchParams.set('session', state.session);
  return url.toString();
}

function makeSession() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function sanitizeSession(value) {
  const session = String(value || '').trim();
  return /^[a-zA-Z0-9_-]{6,64}$/.test(session) ? session : '';
}

function setSendStatus(message, isBad) {
  setStatus($('sendStatus'), message, isBad);
}

function setReceiveStatus(message, isBad) {
  setStatus($('receiveStatus'), message, isBad);
}

function setStatus(node, message, isBad) {
  node.textContent = message;
  node.classList.toggle('bad', Boolean(isBad));
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}
