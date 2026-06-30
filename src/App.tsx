import { BrowserRouter, Routes, Route } from 'react-router-dom';
import SurveyList from './pages/SurveyList';
import SurveyForm from './pages/SurveyForm';
import SyncService from './components/SyncService';

function App() {
  return (
    <BrowserRouter>
      {/* El servicio de sincronización se ejecuta en el background de la UI */}
      <SyncService />
      
      <Routes>
        <Route path="/" element={<SurveyList />} />
        <Route path="/new" element={<SurveyForm />} />
        <Route path="/edit/:id" element={<SurveyForm />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
