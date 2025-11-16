// generateSignature.js
import crypto from "crypto";
import dotenv from "dotenv";

// Baca file .env agar kita bisa akses secret key
dotenv.config();

// --- PASTE PAYLOAD JSON ANDA PERSIS DI SINI ---
const payloadString = `{
  "orderID": "SIMULASI-ORDER-12345",
  "state": "DRIVER_ARRIVED"
}`;
// -------------------------------------------

const secret = process.env.GRAB_WEBHOOK_SECRET;

// --- PERBAIKAN DI SINI ---
// Lakukan perhitungan HMAC dengan algoritma sha256 yang benar
const hmac = crypto.createHmac("sha256", secret);
// -------------------------

hmac.update(payloadString);
const signature = hmac.digest("hex");

console.log("--- SIGNATURE UNTUK POSTMAN ---");
console.log(signature);
console.log("---------------------------------");
