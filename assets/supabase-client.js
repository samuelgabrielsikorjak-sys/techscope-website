// ============================================================================
// Supabase klient — inicializácia cez CDN, bez build kroku.
//
// Použitie v HTML (pred týmto skriptom musí byť načítaná Supabase CDN knižnica):
//
//   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
//   <script src="assets/supabase-client.js"></script>
//   <script src="assets/rezervacia-formular.js"></script>  <!-- pripravované -->
//
// Klient je vystavený ako `window.supabaseClient`, takže ho vie použiť
// hociktorý ďalší <script> na stránke bez importu/build kroku:
//
//   const { data, error } = await window.supabaseClient
//     .from('call_slots')
//     .select('*');
//
// Návod na doplnenie SUPABASE_URL a SUPABASE_ANON_KEY: pozri SETUP.md
// ============================================================================

const SUPABASE_URL = 'https://gbicafrzbipizcdvbdve.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_-EZ9ptnPpiOrDZxYvcHmEA_0DJelowK';

window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
