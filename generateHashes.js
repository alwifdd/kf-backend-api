// generateHashes.js
import bcrypt from "bcrypt";

const saltRounds = 10;
const plainPassword = "bm_ambon";

bcrypt.hash(plainPassword, saltRounds, function (err, hash) {
  if (err) {
    console.error("Gagal membuat hash:", err);
    return;
  }
  console.log("Password asli:", plainPassword);
  console.log("Gunakan hash ini di database Anda:");
  console.log(hash);
});
