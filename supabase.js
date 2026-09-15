const supabaseUrl = 'https://kwseysanvdyvtfofnhzw.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3c2V5c2FudmR5dnRmb2ZuaHp3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0MDExMzEsImV4cCI6MjEwNDk3NzEzMX0.jEQ5MUak6efMOOFTF7utYqkOiVko0w1JWj0ZOUldOTg';

// Inicializar cliente
window.db = supabase.createClient(supabaseUrl, supabaseKey);
