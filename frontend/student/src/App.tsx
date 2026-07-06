import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import StudentScan from './pages/StudentScan';
import LegacyAttend from './pages/LegacyAttend';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/s/:shortCode" element={<StudentScan />} />
        <Route path="/attend/:shortCode" element={<LegacyAttend />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
