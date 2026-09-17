import { AppShell, PageHeader } from "@/components/app-shell";
import { OfflineQueuePanel } from "@/components/offline-queue-panel";

export default function OfflineSyncPage() {
  return <AppShell active="Offline sync"><PageHeader title="Offline sync."/><OfflineQueuePanel/></AppShell>;
}
