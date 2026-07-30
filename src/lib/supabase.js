import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://sscdkjeoehwjpyhauodp.supabase.co';
const supabaseKey = 'sb_publishable_t3W_u-wEBH9JyV5QG0_R4g_V2xh5byH';

export const supabase = createClient(supabaseUrl, supabaseKey);