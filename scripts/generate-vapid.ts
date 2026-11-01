/** Generate VAPID keys for optional Web Push notifications; paste into .env. */
import webpush from "web-push";
const k = webpush.generateVAPIDKeys();
console.log(`VAPID_PUBLIC_KEY=${k.publicKey}\nVAPID_PRIVATE_KEY=${k.privateKey}\nVAPID_SUBJECT=mailto:admin@example.invalid`);
