// signature.js
import crypto from "crypto";
import dotenv from "dotenv";

// Load secret dari file .env
dotenv.config();

// --- PAYLOAD JSON UNTUK SIGNATURE ---
const payloadString = `{
  "orderID": "SIMULASI-ORDER-8909",
  "partnerMerchantID": "11424",
  "items": [
    {
      "id": "KF116",
      "name": "Voltadex",
      "quantity": 1,
      "modifiers": [
        {
          "id": "m_kemasan_strip",
          "name": "Strip"
        }
      ]
    }
  ]
}`;
// --------------------------------------------------

// Ambil secret dari environment variable
const secret = process.env.GRAB_WEBHOOK_SECRET;

if (!secret) {
  console.error("❌ GRAB_WEBHOOK_SECRET belum di-set di file .env");
  process.exit(1);
}

// Generate signature HMAC-SHA256 (hex)
const signature = crypto
  .createHmac("sha256", secret)
  .update(payloadString)
  .digest("hex");

// Tampilkan hasil
console.log("==========================================");
console.log("🔹 Payload JSON:");
console.log(payloadString);
console.log("==========================================");
console.log("✅ Signature HMAC-SHA256:");
console.log(signature);
console.log("==========================================");
