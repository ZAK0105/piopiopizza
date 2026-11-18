import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';

// Each page brings its own stylesheet, so they are loaded separately.
const Customer = lazy(() => import('./pages/Customer'));
const Admin = lazy(() => import('./pages/Admin'));
const Staff = lazy(() => import('./pages/Staff'));
const Vaktliste = lazy(() => import('./pages/Vaktliste'));

function App() {
  return (
    <Router>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<Customer />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/staff" element={<Staff />} />
          <Route path="/vaktliste" element={<Vaktliste />} />
          <Route path="/kitchen" element={<Navigate to="/admin#kitchen" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Router>
  );
}

export default App;
