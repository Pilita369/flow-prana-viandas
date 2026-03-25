import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://zvobgokyrlehycaqvjtk.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp2b2Jnb2t5cmxlaHljYXF2anRrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTIyOTU5MSwiZXhwIjoyMDg0ODA1NTkxfQ.wyCag4kQkZDdpSxaE_96hQazG11xlerIMcBPfWHfFhQ';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);