// middlewares/verifyGrabSignature.js

import crypto from "crypto";

export const verifyGrabSignature = (req, res, next) => {
  const signature = req.get("X-Grab-Signature");
  if (!signature) {
    return res.status(403).send("Forbidden: No signature provided.");
  }

  // 👇👇👇 MODIFIKASI KRITIS ADA DI SINI 👇👇👇
  // Kita tidak lagi menggunakan JSON.stringify(req.body).
  // Sebagai gantinya, kita langsung menggunakan 'rawBody' yang sudah disimpan.
  const hmac = crypto.createHmac("sha256", process.env.GRAB_WEBHOOK_SECRET);
  hmac.update(req.rawBody); // Menggunakan buffer mentah untuk akurasi 100%
  const expectedSignature = hmac.digest("hex");
  // 👆👆👆 AKHIR DARI MODIFIKASI 👆👆👆

  // --- BLOK DEBUGGING (Sudah disesuaikan) ---
  console.log("--- SIGNATURE DEBUG ---");
  console.log("Raw Body Diterima:", req.rawBody.toString()); // Ubah buffer ke string untuk dibaca
  console.log("Signature Diterima:", signature);
  console.log("Signature Diharapkan:", expectedSignature);
  console.log("--- AKHIR DEBUG ---");
  // ----------------------

  // Membandingkan signature yang diterima dengan yang diharapkan
  if (signature !== expectedSignature) {
    return res.status(403).send("Forbidden: Invalid signature.");
  }

  // Jika cocok, izinkan request untuk melanjutkan
  next();
};
