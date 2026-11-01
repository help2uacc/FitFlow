import { OfflineApp } from "@/components/offline-app";

export const metadata = { title: "حالت آفلاین" };
export const dynamic = "force-static";

/** Public shell (no private data in HTML). Content is read from this device's IndexedDB snapshot. */
export default function OfflinePage() {
  return <OfflineApp />;
}
