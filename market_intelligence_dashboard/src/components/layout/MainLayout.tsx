import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { DataTrustPanel } from '../ui/DataTrustPanel';

export function MainLayout() {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden relative">
        {/* Subtle background blob for premium aesthetic */}
        <div className="absolute top-[-10%] right-[-5%] w-[40%] h-[40%] rounded-full bg-primary/5 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-blue-500/5 blur-[120px] pointer-events-none" />
        
        <Topbar />
        <main className="flex-1 overflow-y-auto w-full z-10 scroll-smooth">
          <div className="min-h-full p-6 md:p-8 max-w-[1600px] mx-auto">
            <DataTrustPanel />
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
