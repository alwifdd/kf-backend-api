// config/supabaseClient.js

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

// Perintahkan Node.js untuk membaca file .env
dotenv.config();

// Ambil URL dan Key dari .env
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

// Buat koneksi (jembatan) ke Supabase
export const supabase = createClient(supabaseUrl, supabaseKey);
