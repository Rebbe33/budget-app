import { createClient } from '@supabase/supabase-js';

// Valeurs de repli uniquement pour que le build ne plante pas si les variables sont absentes.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321';
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'missing-anon-key';

export const supabase = createClient(url, key);
