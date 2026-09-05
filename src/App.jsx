import { useState, useEffect, useCallback } from "react";
import { Bike, Clock, History, Search, Download, TriangleAlert, Check, X, Plus, RotateCcw, Trash2, Pencil, WifiOff } from "lucide-react";
import { supabase, isConfigured } from "./supabaseClient";

// Bici numerate 1..10 + due bici per bambini (id 11 e 12).
const BIKE_NAMES = { 11: "Baby Kids", 12: "Kids" };
const FLEET = [...Array.from({ length: 10 }, (_, i) => i + 1), 11, 12];
const bikeLabel = (b) => BIKE_NAMES[b] || String(b);
const isNamed = (b) => Boolean(BIKE_NAMES[b]);
const orderBikes = (arr) => FLEET.filter((b) => arr.includes(b));

// ---------- time helpers ----------
const pad = (n) => String(n).padStart(2, "0");
const toTimeInput = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
function timeInputToEpoch(hhmm, ref = new Date()) {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(ref);
  d.setHours(h, m, 0, 0);
  return d.getTime();
}
function fmtDateTime(ts) {
  return new Date(ts).toLocaleString("it-IT", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}
function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}
function fmtDuration(ms) {
  if (ms < 0) ms = 0;
  const min = Math.round(ms / 60000);
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  return `${h}h ${pad(m)}m`;
}

export default function App() {
  const [active, setActive] = useState({}); // { [bike]: {id, room, start, note} }
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState(null);
  const [view, setView] = useState("flotta");
  const [now, setNow] = useState(Date.now());

  const [selected, setSelected] = useState([]);
  const [showStart, setShowStart] = useState(false);
  const [returning, setReturning] = useState([]);
  const [saving, setSaving] = useState(false);

  // form fields
  const [room, setRoom] = useState("");
  const [startTime, setStartTime] = useState("");
  const [returnTime, setReturnTime] = useState("");
  const [damagedBikes, setDamagedBikes] = useState([]);
  const [note, setNote] = useState("");

  // storico
  const [query, setQuery] = useState("");
  const [onlyDamage, setOnlyDamage] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editNote, setEditNote] = useState("");
  const [editDamaged, setEditDamaged] = useState(false);

  // ---------- data ----------
  const load = useCallback(async () => {
    if (!isConfigured) {
      setDbError("config");
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("rentals")
      .select("*")
      .order("start_at", { ascending: false });
    if (error) {
      console.error(error);
      setDbError(error.message || "Errore di connessione al database");
      setLoading(false);
      return;
    }
    setDbError(null);
    const a = {};
    const h = [];
    for (const r of data) {
      if (r.end_at === null) {
        a[r.bike] = { id: r.id, room: r.room, start: new Date(r.start_at).getTime(), note: r.note || "" };
      } else {
        h.push({
          id: r.id,
          bike: r.bike,
          room: r.room,
          start: new Date(r.start_at).getTime(),
          end: new Date(r.end_at).getTime(),
          damaged: r.damaged,
          note: r.note || "",
        });
      }
    }
    h.sort((x, y) => y.end - x.end);
    setActive(a);
    setHistory(h);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    if (!isConfigured) return;
    const channel = supabase
      .channel("rentals-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "rentals" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  // live clock for elapsed time
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  // ---------- actions ----------
  function toggleSelect(bike) {
    const isOut = !!active[bike];
    setSelected((s) => {
      if (s.includes(bike)) return s.filter((x) => x !== bike);
      if (s.length > 0 && !!active[s[0]] !== isOut) return [bike]; // cambio modalità: riparto pulito
      return [...s, bike];
    });
  }

  function openStart() {
    if (selected.length === 0) return;
    setRoom("");
    setStartTime(toTimeInput(new Date()));
    setNote("");
    setShowStart(true);
  }
  async function confirmStart() {
    if (!room.trim() || selected.length === 0 || saving) return;
    setSaving(true);
    const start = startTime ? timeInputToEpoch(startTime) : Date.now();
    const rows = selected.map((b) => ({
      bike: b,
      room: room.trim(),
      start_at: new Date(start).toISOString(),
      note: note.trim(),
    }));
    const { error } = await supabase.from("rentals").insert(rows);
    setSaving(false);
    if (error) {
      alert("Una delle bici risulta già noleggiata da un altro dispositivo. Aggiorno l'elenco.");
    }
    setShowStart(false);
    setSelected([]);
    await load();
  }

  function openReturn() {
    if (selected.length === 0) return;
    setReturnTime(toTimeInput(new Date()));
    setDamagedBikes([]);
    setNote("");
    setReturning([...selected]);
  }
  function toggleDamaged(bike) {
    setDamagedBikes((d) => (d.includes(bike) ? d.filter((x) => x !== bike) : [...d, bike]));
  }
  async function confirmReturn() {
    if (saving) return;
    setSaving(true);
    const end = returnTime ? timeInputToEpoch(returnTime) : Date.now();
    const endISO = new Date(end).toISOString();
    const targets = returning.filter((b) => active[b]);
    await Promise.all(
      targets.map((b) =>
        supabase
          .from("rentals")
          .update({
            end_at: endISO,
            damaged: damagedBikes.includes(b),
            note: [active[b].note, note.trim()].filter(Boolean).join(" · "),
          })
          .eq("id", active[b].id)
      )
    );
    setSaving(false);
    setReturning([]);
    setSelected([]);
    await load();
  }
  async function cancelActive() {
    if (saving) return;
    setSaving(true);
    const targets = returning.filter((b) => active[b]);
    await Promise.all(targets.map((b) => supabase.from("rentals").delete().eq("id", active[b].id)));
    setSaving(false);
    setReturning([]);
    setSelected([]);
    await load();
  }

  async function saveEdit(id) {
    await supabase.from("rentals").update({ note: editNote.trim(), damaged: editDamaged }).eq("id", id);
    setEditingId(null);
    await load();
  }
  async function deleteEntry(id) {
    if (!window.confirm("Eliminare definitivamente questa voce dallo storico?")) return;
    await supabase.from("rentals").delete().eq("id", id);
    await load();
  }

  function exportCSV() {
    const head = ["Bici", "Camera", "Inizio", "Consegna", "Durata (min)", "Danno", "Note"];
    const rows = history.map((h) => [
      bikeLabel(h.bike), h.room, fmtDateTime(h.start), fmtDateTime(h.end),
      Math.round((h.end - h.start) / 60000), h.damaged ? "SI" : "", (h.note || "").replace(/"/g, "'"),
    ]);
    const csv = [head, ...rows].map((r) => r.map((c) => `"${c}"`).join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `storico-noleggio-bici-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ---------- derived ----------
  const bikes = FLEET;
  const outCount = Object.keys(active).length;
  const selOut = selected.length > 0 && !!active[selected[0]];
  const filtered = history.filter((h) => {
    if (onlyDamage && !h.damaged) return false;
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return (
      String(h.bike) === q ||
      bikeLabel(h.bike).toLowerCase().includes(q) ||
      h.room.toLowerCase().includes(q) ||
      (h.note || "").toLowerCase().includes(q)
    );
  });

  if (dbError === "config") {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <WifiOff className="w-10 h-10 mx-auto mb-3 text-slate-400" />
          <h1 className="text-lg font-semibold text-slate-800 mb-2">Configurazione mancante</h1>
          <p className="text-sm text-slate-500">
            Le variabili <code className="bg-slate-200 px-1 rounded">VITE_SUPABASE_URL</code> e{" "}
            <code className="bg-slate-200 px-1 rounded">VITE_SUPABASE_ANON_KEY</code> non sono impostate.
            Aggiungile su Netlify (Site settings → Environment variables) e rilancia il deploy.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-400">
        <Bike className="w-5 h-5 mr-2 animate-pulse" /> Carico il registro…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-slate-800 text-white flex items-center justify-center">
              <Bike className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-semibold leading-tight">Noleggio bici</h1>
              <p className="text-xs text-slate-500 leading-tight">
                {outCount} in uso · {bikes.length - outCount} disponibili
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-lg font-semibold tabular-nums">{fmtTime(now)}</div>
            <div className="text-xs text-slate-400">
              {new Date(now).toLocaleDateString("it-IT", { weekday: "short", day: "2-digit", month: "short" })}
            </div>
          </div>
        </div>
        <div className="max-w-4xl mx-auto px-4 pb-3 flex gap-1">
          {[["flotta", "Flotta", Bike], ["storico", "Storico", History]].map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition ${
                view === key ? "bg-slate-800 text-white" : "text-slate-500 hover:bg-slate-100"
              }`}
            >
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>
      </header>

      {dbError && dbError !== "config" && (
        <div className="max-w-4xl mx-auto px-4 pt-3">
          <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 flex items-center gap-2">
            <WifiOff className="w-4 h-4" /> Problema di connessione al database. Riprovo automaticamente.
          </div>
        </div>
      )}

      <main className={`max-w-4xl mx-auto px-4 py-5 ${view === "flotta" && selected.length > 0 ? "pb-28" : ""}`}>
        {/* FLOTTA */}
        {view === "flotta" && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {bikes.map((b) => {
              const rec = active[b];
              const isSel = selected.includes(b);
              if (!rec) {
                return (
                  <button
                    key={b}
                    onClick={() => toggleSelect(b)}
                    className={`group aspect-square rounded-xl border-2 flex flex-col items-center justify-center transition ${
                      isSel
                        ? "border-emerald-500 bg-emerald-500 text-white"
                        : "border-dashed border-slate-200 bg-white hover:border-emerald-400 hover:bg-emerald-50"
                    }`}
                  >
                    <span className={`${isNamed(b) ? "text-base leading-tight text-center px-1" : "text-3xl"} font-bold ${isSel ? "text-white" : "text-slate-700"}`}>{bikeLabel(b)}</span>
                    <span className={`mt-1 text-xs font-medium flex items-center gap-1 ${isSel ? "text-white" : "text-emerald-600"}`}>
                      {isSel ? (<><Check className="w-3 h-3" /> Selezionata</>) : (<><Plus className="w-3 h-3" /> Seleziona</>)}
                    </span>
                  </button>
                );
              }
              return (
                <button
                  key={b}
                  onClick={() => toggleSelect(b)}
                  className={`aspect-square rounded-xl border-2 p-3 flex flex-col justify-between text-left transition ${
                    isSel ? "border-amber-500 ring-2 ring-amber-400 bg-amber-100" : "border-amber-300 bg-amber-50 hover:border-amber-400"
                  }`}
                >
                  <div className="flex items-start justify-between w-full">
                    <span className={`${isNamed(b) ? "text-sm leading-tight" : "text-2xl"} font-bold text-amber-900`}>{bikeLabel(b)}</span>
                    {isSel ? (
                      <span className="w-5 h-5 rounded-full bg-amber-500 text-white flex items-center justify-center">
                        <Check className="w-3.5 h-3.5" />
                      </span>
                    ) : (
                      <span className="text-[11px] font-semibold text-amber-700 bg-amber-200/60 rounded px-1.5 py-0.5">
                        Cam. {rec.room}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-amber-800 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Cam. {rec.room} · dalle {fmtTime(rec.start)}
                  </div>
                  <span className="w-full text-xs font-medium text-amber-700 flex items-center gap-1">
                    <RotateCcw className="w-3.5 h-3.5" /> {isSel ? "Da consegnare" : "Consegna"}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Barra selezione multipla */}
        {view === "flotta" && selected.length > 0 && (
          <div className="fixed bottom-0 inset-x-0 z-20 bg-white border-t border-slate-200 shadow-lg">
            <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
              <div className="text-sm text-slate-600">
                <span className="font-semibold text-slate-800">{selected.length}</span>{" "}
                {selOut ? "da consegnare" : "da noleggiare"}: <span className="font-medium">{orderBikes(selected).map(bikeLabel).join(", ")}</span>
                <button onClick={() => setSelected([])} className="ml-3 text-xs text-slate-400 hover:text-slate-600 underline">
                  azzera
                </button>
              </div>
              {selOut ? (
                <button
                  onClick={openReturn}
                  className="px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-medium flex items-center gap-1.5"
                >
                  <RotateCcw className="w-4 h-4" /> Consegna <span className="tabular-nums">({selected.length})</span>
                </button>
              ) : (
                <button
                  onClick={openStart}
                  className="px-5 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-medium flex items-center gap-1.5"
                >
                  Avanti <span className="tabular-nums">({selected.length})</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* STORICO */}
        {view === "storico" && (
          <div>
            <div className="flex flex-col sm:flex-row gap-2 mb-4">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Cerca per camera, bici o nota…"
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                />
              </div>
              <button
                onClick={() => setOnlyDamage((v) => !v)}
                className={`px-3 py-2 rounded-lg text-sm font-medium border flex items-center gap-1.5 transition ${
                  onlyDamage ? "bg-rose-500 border-rose-500 text-white" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                <TriangleAlert className="w-4 h-4" /> Solo danni
              </button>
              <button
                onClick={exportCSV}
                disabled={history.length === 0}
                className="px-3 py-2 rounded-lg text-sm font-medium border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 flex items-center gap-1.5"
              >
                <Download className="w-4 h-4" /> CSV
              </button>
            </div>

            {filtered.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <History className="w-8 h-8 mx-auto mb-2 opacity-50" />
                {history.length === 0 ? "Ancora nessun noleggio registrato." : "Nessun risultato per questa ricerca."}
              </div>
            ) : (
              <div className="space-y-2">
                {filtered.map((h) => (
                  <div
                    key={h.id}
                    className={`rounded-lg border p-3 ${h.damaged ? "border-rose-300 bg-rose-50" : "border-slate-200 bg-white"}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-10 h-10 shrink-0 rounded-lg flex items-center justify-center font-bold ${h.damaged ? "bg-rose-500 text-white" : "bg-slate-100 text-slate-700"}`}>
                          {isNamed(h.bike) ? <Bike className="w-5 h-5" /> : h.bike}
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-sm">
                            Bici {bikeLabel(h.bike)} · Camera {h.room}
                            {h.damaged && (
                              <span className="ml-2 inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600">
                                <TriangleAlert className="w-3 h-3" /> Danno
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 tabular-nums">
                            {fmtDateTime(h.start)} → {fmtTime(h.end)} · {fmtDuration(h.end - h.start)}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => { setEditingId(h.id); setEditNote(h.note || ""); setEditDamaged(h.damaged); }}
                          className="p-1.5 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                          title="Modifica nota / danno"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => deleteEntry(h.id)}
                          className="p-1.5 rounded-md text-slate-400 hover:bg-rose-100 hover:text-rose-600"
                          title="Elimina"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {editingId === h.id ? (
                      <div className="mt-3 pt-3 border-t border-slate-200 space-y-2">
                        <textarea
                          value={editNote}
                          onChange={(e) => setEditNote(e.target.value)}
                          rows={2}
                          placeholder="Note (es. graffio parafango, gomma a terra…)"
                          className="w-full px-3 py-2 rounded-md border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                        />
                        <label className="flex items-center gap-2 text-sm text-slate-600">
                          <input type="checkbox" checked={editDamaged} onChange={(e) => setEditDamaged(e.target.checked)} className="w-4 h-4 accent-rose-500" />
                          Segna come danno
                        </label>
                        <div className="flex gap-2">
                          <button onClick={() => saveEdit(h.id)} className="px-3 py-1.5 rounded-md bg-slate-800 text-white text-sm font-medium flex items-center gap-1">
                            <Check className="w-4 h-4" /> Salva
                          </button>
                          <button onClick={() => setEditingId(null)} className="px-3 py-1.5 rounded-md text-slate-500 text-sm hover:bg-slate-100">
                            Annulla
                          </button>
                        </div>
                      </div>
                    ) : (
                      h.note && <p className="mt-2 text-sm text-slate-600 whitespace-pre-wrap">{h.note}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* MODAL: avvio */}
      {showStart && (
        <Modal
          onClose={() => setShowStart(false)}
          title={selected.length === 1 ? `Noleggio bici ${bikeLabel(selected[0])}` : `Noleggio ${selected.length} bici`}
        >
          <label className="block text-sm font-medium text-slate-600 mb-1">Numero camera</label>
          <input
            autoFocus
            value={room}
            onChange={(e) => setRoom(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && confirmStart()}
            inputMode="numeric"
            placeholder="es. 204"
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-lg focus:outline-none focus:ring-2 focus:ring-slate-300 mb-1"
          />
          {selected.length > 1 && (
            <p className="text-xs text-slate-400 mb-4">La camera e l'orario valgono per tutte le {selected.length} bici selezionate.</p>
          )}
          {selected.length <= 1 && <div className="mb-4" />}
          <label className="block text-sm font-medium text-slate-600 mb-1">Orario di inizio</label>
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-lg tabular-nums focus:outline-none focus:ring-2 focus:ring-slate-300 mb-1"
          />
          <p className="text-xs text-slate-400 mb-4">Impostato in automatico all'ora attuale — modificalo solo se serve.</p>
          <label className="block text-sm font-medium text-slate-600 mb-1">Nota (facoltativa)</label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="es. consegnato casco, luci…"
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 mb-4"
          />
          <div className="flex gap-2">
            <button onClick={confirmStart} disabled={!room.trim() || saving} className="flex-1 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-white font-medium flex items-center justify-center gap-1.5">
              <Check className="w-4 h-4" /> {selected.length > 1 ? `Avvia ${selected.length} noleggi` : "Avvia noleggio"}
            </button>
            <button onClick={() => setShowStart(false)} className="px-4 py-2.5 rounded-lg text-slate-500 hover:bg-slate-100 font-medium">
              Annulla
            </button>
          </div>
        </Modal>
      )}

      {/* MODAL: consegna */}
      {returning.length > 0 && (
        <Modal
          onClose={() => setReturning([])}
          title={returning.length === 1 ? `Consegna bici ${bikeLabel(returning[0])}` : `Consegna ${returning.length} bici`}
        >
          <label className="block text-sm font-medium text-slate-600 mb-1">Orario di consegna</label>
          <input
            type="time"
            value={returnTime}
            onChange={(e) => setReturnTime(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-lg tabular-nums focus:outline-none focus:ring-2 focus:ring-slate-300 mb-4"
          />

          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-600 mb-1">
              Bici in consegna {returning.length > 1 && "— spunta solo quelle danneggiate"}
            </label>
            <div className="space-y-1.5">
              {orderBikes(returning).map((b) => {
                const rec = active[b];
                const dmg = damagedBikes.includes(b);
                return (
                  <button
                    key={b}
                    onClick={() => toggleDamaged(b)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-left transition ${
                      dmg ? "border-rose-300 bg-rose-50" : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <span className="text-sm">
                      <span className="font-semibold">Bici {bikeLabel(b)}</span>
                      {rec && <span className="text-slate-500"> · Cam. {rec.room}</span>}
                    </span>
                    <span className={`text-xs font-medium flex items-center gap-1 ${dmg ? "text-rose-600" : "text-slate-400"}`}>
                      <TriangleAlert className="w-4 h-4" /> {dmg ? "Danno" : "OK"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <label className="block text-sm font-medium text-slate-600 mb-1">
            Note {damagedBikes.length > 0 && "(descrivi il danno)"}
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder={damagedBikes.length > 0 ? "es. freno posteriore rotto, cestino piegato…" : "facoltativo"}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 mb-4"
          />

          <div className="flex gap-2">
            <button onClick={confirmReturn} disabled={saving} className="flex-1 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white font-medium flex items-center justify-center gap-1.5">
              <Check className="w-4 h-4" /> {returning.length > 1 ? `Registra ${returning.length} consegne` : "Registra consegna"}
            </button>
            <button onClick={() => setReturning([])} className="px-4 py-2.5 rounded-lg text-slate-500 hover:bg-slate-100 font-medium">
              Annulla
            </button>
          </div>
          <button
            onClick={cancelActive}
            className="w-full mt-2 text-xs text-slate-400 hover:text-rose-500 py-1"
          >
            {returning.length > 1 ? "Elimina questi noleggi (inseriti per errore)" : "Elimina noleggio (inserito per errore)"}
          </button>
        </Modal>
      )}
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl p-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-lg">{title}</h2>
          <button onClick={onClose} className="p-1 rounded-md text-slate-400 hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
