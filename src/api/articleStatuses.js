const STORAGE_KEY = 'medical_article_statuses_v1';

function readStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (_) {
    return {};
  }
}

function writeStore(store) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (_) {
    // ignore quota or serialization errors
  }
}

export function getStatusMap() {
  const store = readStore();
  return new Map(Object.entries(store).map(([id, value]) => [Number(id), value]));
}

export function setStatus(articleId, status) {
  const store = readStore();
  if (status) {
    store[articleId] = { status, updatedAt: new Date().toISOString() };
  } else {
    delete store[articleId];
  }
  writeStore(store);
}

export function clearAllStatuses() {
  writeStore({});
}


