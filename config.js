/* ============================================================
   RÉGLAGES DE LA PLANQUE : c'est le seul fichier à modifier.
   Les deux valeurs se trouvent dans Supabase :
   Project Settings > API (ou le bouton « Connect » en haut).
   ============================================================ */
window.PLANQUE_CONFIG = {
  // L'adresse de ton projet Supabase, par exemple https://abcdefghij.supabase.co
  SUPABASE_URL: "https://aatoqaskfmyfemqrysfa.supabase.co",

  // La clé publique « anon » (ou « publishable »). Elle peut être visible sans danger :
  // ce sont les règles de la base (fichier supabase.sql) qui protègent les données.
  // Ne mets JAMAIS ici la clé « service_role » (ou « secret »), ni ta clé Anthropic.
  SUPABASE_ANON_KEY: "sb_publishable_AB53mkQbokQk38n612I5PQ_FxObFjt_",

  // Mets true quand tu as installé la fonction « guide » (étape 5 du mode d'emploi).
  GUIDE_ENABLED: false
};
