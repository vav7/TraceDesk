import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar, { MobileNav } from './Sidebar';
import Header from './Header';
import ToastHost from '../ToastHost';
import Spotlight from '../motion/Spotlight';
import { EventStreamProvider } from '../../lib/EventStreamContext';

export default function Layout() {
  const location = useLocation();
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);

  // Scroll state via IntersectionObserver sentinel (no scroll listeners):
  // when the top sentinel leaves the viewport, the header gains elevation.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setScrolled(!entry.isIntersecting), { threshold: 1 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <EventStreamProvider>
      <div className="relative flex min-h-screen">
        <Sidebar />
        <div className="relative flex min-w-0 flex-1 flex-col">
          <div ref={sentinelRef} aria-hidden="true" className="h-px w-1" />
          <Header scrolled={scrolled} />
          <MobileNav />
          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
            <div key={location.pathname} className="mx-auto max-w-7xl animate-fade-up">
              <Outlet />
            </div>
          </main>
        </div>

        <ToastHost />
        <Spotlight />
      </div>
    </EventStreamProvider>
  );
}
