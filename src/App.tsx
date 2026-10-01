import { BrowserRouter, Routes, Route } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import BootGate from './components/BootGate';
import Layout from './components/Layout/Layout';
import Dashboard from './pages/Dashboard';
import Integrations from './pages/Integrations';
import Incidents from './pages/Incidents';
import IncidentDetail from './pages/IncidentDetail';
import Lab from './pages/Lab';
import Runbooks from './pages/Runbooks';
import RunbookDetail from './pages/RunbookDetail';
import Help from './pages/Help';

function App() {
  // No artificial splash: hosting platforms already introduce wait time
  // (cold starts), so the workspace renders immediately. BootGate still
  // shows a branded screen only when the backend is genuinely waking.
  return (
    <ErrorBoundary>
      {/* The workspace mounts and starts fetching behind the splash, so it is
          already populated when the boot screen fades. */}
      <BootGate>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="integrations" element={<Integrations />} />
            <Route path="incidents" element={<Incidents />} />
            <Route path="incidents/:id" element={<IncidentDetail />} />
            <Route path="lab" element={<Lab />} />
            <Route path="runbooks" element={<Runbooks />} />
            <Route path="runbooks/:id" element={<RunbookDetail />} />
            <Route path="help" element={<Help />} />
          </Route>
        </Routes>
      </BrowserRouter>
      </BootGate>
    </ErrorBoundary>
  );
}

export default App;
