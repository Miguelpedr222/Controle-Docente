const DB_NAME = "fiscaliza-docente-db";
let dbPromise;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("schedule")) {
        const store = db.createObjectStore("schedule", { keyPath: "id" });
        store.createIndex("date", "date");
        store.createIndex("day", "day");
        store.createIndex("status", "status");
        store.createIndex("scheduledTeacher", "scheduledTeacher");
      }
      if (!db.objectStoreNames.contains("inspections")) {
        const store = db.createObjectStore("inspections", { keyPath: "id", autoIncrement: true });
        store.createIndex("date", "date");
        store.createIndex("status", "status");
        store.createIndex("scheduledTeacher", "scheduledTeacher");
      }
      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

async function transaction(storeName, mode = "readonly") {
  const db = await openDB();
  return db.transaction(storeName, mode).objectStore(storeName);
}

export async function count(storeName) {
  const store = await transaction(storeName);
  return new Promise((resolve, reject) => {
    const r = store.count();
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function getAll(storeName) {
  const store = await transaction(storeName);
  return new Promise((resolve, reject) => {
    const r = store.getAll();
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function get(storeName, key) {
  const store = await transaction(storeName);
  return new Promise((resolve, reject) => {
    const r = store.get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function put(storeName, value) {
  const store = await transaction(storeName, "readwrite");
  return new Promise((resolve, reject) => {
    const r = store.put(value);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function add(storeName, value) {
  const store = await transaction(storeName, "readwrite");
  return new Promise((resolve, reject) => {
    const r = store.add(value);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function remove(storeName, key) {
  const store = await transaction(storeName, "readwrite");
  return new Promise((resolve, reject) => {
    const r = store.delete(key);
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  });
}

export async function clearStore(storeName) {
  const store = await transaction(storeName, "readwrite");
  return new Promise((resolve, reject) => {
    const r = store.clear();
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  });
}

export async function bulkPut(storeName, values) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    values.forEach(v => store.put(v));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function seedIfEmpty(initialData) {
  // V3.3: reparo seguro. Nunca limpa a base existente e nunca substitui
  // registros já salvos pelo usuário. Apenas adiciona o que estiver faltando.
  const existingSchedule = await getAll("schedule");
  const existingIds = new Set(existingSchedule.map(item => item.id));
  const missingSchedule = initialData.schedule.filter(item => !existingIds.has(item.id));

  if (missingSchedule.length) {
    await bulkPut("schedule", missingSchedule);
  }

  // As observações importadas da planilha possuem autoIncrement no banco.
  // Se ainda não houver nenhuma observação, importa a base completa.
  const existingInspections = await count("inspections");
  if (existingInspections === 0 && initialData.inspections.length) {
    for (const item of initialData.inspections) {
      await add("inspections", {
        ...item,
        source: "Planilha — Apoio Docentes",
        imported: true,
        createdAt: new Date().toISOString()
      });
    }
  }

  const appSettings = await get("settings", "app");
  if (!appSettings) {
    await put("settings", {
      key: "app",
      institution: "UNIG — Universidade Iguaçu",
      responsible: "João Miguel Alves Pedrosa",
      seededAt: new Date().toISOString()
    });
  }

  return missingSchedule.length > 0 || existingInspections === 0;
}

export async function exportDatabase() {
  const [schedule, inspections, settings] = await Promise.all([
    getAll("schedule"), getAll("inspections"), getAll("settings")
  ]);
  return {
    format: "Fiscaliza Docente Backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    schedule,
    inspections,
    settings
  };
}

export async function importDatabase(payload) {
  if (!payload || !Array.isArray(payload.schedule) || !Array.isArray(payload.inspections)) {
    throw new Error("Arquivo de backup inválido.");
  }
  await clearStore("schedule");
  await clearStore("inspections");
  await clearStore("settings");
  await bulkPut("schedule", payload.schedule);
  for (const item of payload.inspections) {
    const copy = { ...item };
    delete copy.id;
    await add("inspections", copy);
  }
  if (Array.isArray(payload.settings)) {
    await bulkPut("settings", payload.settings);
  }
}

export { openDB };
