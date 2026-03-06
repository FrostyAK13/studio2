import EmporerDashboard from '@/components/SignalPulseDashboard';
import { Toaster } from '@/components/ui/toaster';

export default function Home() {
  return (
    <main className="min-h-screen bg-background">
      <EmporerDashboard />
      <Toaster />
    </main>
  );
}
