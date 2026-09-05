# Noleggio bici — Hotel

Registro digitale per il noleggio delle bici (10 bici, dalla 1 alla 10).
Web app React + Vite, database su **Supabase**, hosting su **Netlify**.
I dati si aggiornano in tempo reale su tutti i dispositivi aperti (reception, telefono, tablet).

---

## Cosa ti serve (gratis)

- Un account **Supabase** → https://supabase.com
- Un account **Netlify** → https://netlify.com
- (Consigliato) Un account **GitHub** → https://github.com

Tempo richiesto: circa 15–20 minuti.

---

## Passo 1 — Crea il database su Supabase

1. Accedi a Supabase e clicca **New project**. Dai un nome (es. `noleggio-bici`),
   scegli una password per il database (salvala) e la region più vicina (Europe).
2. Aspetta 1–2 minuti che il progetto sia pronto.
3. Nel menu a sinistra apri **SQL Editor** → **New query**.
4. Apri il file `supabase-schema.sql` di questo progetto, copia **tutto** il contenuto,
   incollalo nell'editor e premi **Run**.
   Deve comparire "Success". (Se sull'ultima riga vedi un errore tipo
   *"is already member"*, ignoralo: significa solo che il realtime era già attivo.)
5. Ora prendi le due chiavi che serviranno all'app. Vai su **Project Settings**
   (l'icona ingranaggio) → **API** e copia:
   - **Project URL** (es. `https://abcd1234.supabase.co`)
   - **anon public** key (una stringa lunga che inizia con `eyJ...`)

   Tienile da parte: le userai al Passo 3.

> La chiave `anon public` è pensata per stare nel frontend, è normale che sia
> "pubblica". La sicurezza è gestita dalle regole del database (vedi in fondo).

---

## Passo 2 — Metti il codice online

Hai due strade. La **A** (GitHub) è la migliore perché ti permette aggiornamenti
automatici; la **B** è la più rapida se non vuoi usare GitHub.

### Strada A — con GitHub (consigliata)

1. Crea un repository nuovo su GitHub (può essere privato).
2. Carica dentro tutti i file di questa cartella. Se usi il terminale:
   ```bash
   git init
   git add .
   git commit -m "Prima versione"
   git branch -M main
   git remote add origin https://github.com/TUO-UTENTE/noleggio-bici.git
   git push -u origin main
   ```
   (In alternativa usa GitHub Desktop e trascina la cartella.)
3. Vai su Netlify → **Add new site** → **Import an existing project** → **GitHub**,
   autorizza e scegli il repository.
4. Netlify legge già da solo la configurazione (comando `npm run build`, cartella
   `dist`, grazie al file `netlify.toml`). Non toccare nulla e vai avanti fino
   alla schermata delle variabili d'ambiente → **prosegui al Passo 3**.

### Strada B — senza GitHub (drag & drop del build)

In questo caso il build lo fai tu sul tuo computer:
```bash
npm install
npm run build
```
Poi trascini la cartella `dist` generata dentro Netlify (sezione **Deploys** →
area "drag and drop"). Con questa strada le variabili d'ambiente devi impostarle
**prima** del build creando un file `.env` (vedi `.env.example`), altrimenti l'app
mostrerà "Configurazione mancante". Per gli aggiornamenti futuri dovrai rifare
`npm run build` e ricaricare `dist` a mano — per questo la Strada A è più comoda.

---

## Passo 3 — Collega l'app al database (variabili d'ambiente)

Su Netlify: **Site settings** → **Environment variables** → **Add a variable**,
e aggiungi queste due (i valori del Passo 1):

| Nome                       | Valore                          |
|----------------------------|---------------------------------|
| `VITE_SUPABASE_URL`        | il tuo Project URL              |
| `VITE_SUPABASE_ANON_KEY`   | la tua chiave `anon public`     |

Poi vai su **Deploys** → **Trigger deploy** → **Deploy site** per rilanciare la
pubblicazione con le variabili attive.

Al termine Netlify ti dà un indirizzo tipo `https://nome-a-caso.netlify.app`.
Aprilo: dovresti vedere la flotta delle 10 bici. Fatto! 🎉

---

## Uso quotidiano

- **Noleggiare**: tocca le bici libere (diventano verdi) → **Avanti** → inserisci
  la camera una sola volta, l'orario di inizio è già impostato all'ora attuale.
- **Consegnare**: tocca le bici già fuori (diventano ambra) → **Consegna** →
  imposta l'orario di riconsegna; se una bici è danneggiata spuntala e scrivi la
  nota. Le bici a posto restano su "OK".
- **Storico**: cerca per camera / numero bici / testo nota, filtra "Solo danni",
  correggi le note (matita) o esporta tutto in **CSV** per archiviare le prove.

Per usarlo dalla reception: apri il link sul dispositivo e **aggiungilo alla home**
(sia iPhone che Android permettono "Aggiungi a schermata Home"): funzionerà come
un'app.

---

## Personalizzazioni rapide

- **Cambiare il numero di bici**: apri `src/App.jsx`, in alto cambia
  `const TOTAL_BIKES = 10;`. Se vai oltre la 10, aggiorna anche il vincolo nel
  database: nel file SQL la riga `check (bike between 1 and 10)`.
- **Dominio personalizzato** (es. `bici.tuohotel.it`): su Netlify → **Domain
  management**.

---

## Nota sulla sicurezza

Così com'è, chiunque conosca il link Netlify può usare il registro. Per uno
strumento interno all'hotel di solito va bene (il link non è pubblicizzato).
Se in futuro vuoi limitare l'accesso, le strade sono:

1. **Login con Supabase Auth**: crei uno o più utenti (email/password) e cambi la
   regola RLS nel database per consentire l'accesso solo agli utenti autenticati
   (`to authenticated` invece di `to anon`). Posso prepararti io questa versione.
2. **Protezione a livello di sito** con Netlify (password del sito) — disponibile
   nei piani a pagamento di Netlify.

Il file `supabase-schema.sql` attiva già la Row Level Security: senza la policy
inclusa, nessuno potrebbe leggere o scrivere. La policy attuale apre l'accesso
alla sola chiave pubblica `anon`, che è ciò che usa questa app.

---

## Sviluppo in locale (facoltativo)

```bash
npm install
cp .env.example .env   # poi metti dentro le tue due chiavi
npm run dev            # apre http://localhost:5173
```

---

## Come azzerare i dati di prova

Dopo i test, per ripartire puliti: Supabase → **Table Editor** → tabella
`rentals` → seleziona le righe e cancellale, oppure da **SQL Editor**:
```sql
delete from public.rentals;
```
