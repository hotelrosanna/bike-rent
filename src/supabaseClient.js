import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isConfigured = Boolean(url && key);

if (!isConfigured) {
  console.error(
    "Configurazione mancante: imposta VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY nelle variabili d'ambiente."
  );
}

// Se manca la config, creiamo comunque un client fittizio così l'app non crasha
// e possiamo mostrare un messaggio chiaro all'utente.
export const supabase = createClient(url || "https://placeholder.supabase.co", key || "placeholder");
