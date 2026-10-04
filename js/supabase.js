// Conexão com o Supabase
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://rjbkwbtnomiztrataqil.supabase.co';
const SUPABASE_ANON_KEY ='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJqYmt3YnRub21penRyYXRhcWlsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEwNjQ4ODEsImV4cCI6MjEwNjY0MDg4MX0.EYiYbT3Xs1Oxo1_wWGDgAUwY8JtYde56tkL2qfHKp-M';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);