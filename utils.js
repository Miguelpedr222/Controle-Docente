export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

export function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

export function todayISO() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0,10);
}

export function formatDate(value) {
  if (!value) return "—";
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString("pt-BR");
}

export function dayName(dateValue) {
  if (!dateValue) return "";
  const d = new Date(`${dateValue}T00:00:00`);
  return d.toLocaleDateString("pt-BR", { weekday: "long" })
    .replace(/^./, c => c.toUpperCase());
}

export function statusClass(status = "") {
  const s = status.toLowerCase();
  if (s.includes("presente")) return "status-present";
  if (s.includes("substit")) return "status-substitute";
  if (s.includes("atras")) return "status-late";
  if (s.includes("falta") || s.includes("ausente") || s.includes("não localizado")) return "status-absent";
  if (s.includes("justificada")) return "status-justified";
  if (s.includes("prática") || s.includes("outro") || s.includes("unificada")) return "status-other";
  return "status-pending";
}

export function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function downloadText(filename, text, type = "application/json") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function csvEscape(value) {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"','""')}"`;
}

export function toCSV(rows, columns) {
  const head = columns.map(c => csvEscape(c.label)).join(";");
  const body = rows.map(row => columns.map(c => csvEscape(row[c.key])).join(";")).join("\n");
  return "\uFEFF" + head + "\n" + body;
}

export function showToast(message, type = "success") {
  const host = $("#toastHost");
  if (!host) return;
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.innerHTML = `<span>${escapeHTML(message)}</span>`;
  host.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

export function debounce(fn, delay = 250) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
