import { Routes, Route } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import AppLayout from './components/layout/AppLayout';
import ProjectList from './components/project/ProjectList';
import ProjectDetail from './components/project/ProjectDetail';
import AdminPanel from './components/auth/AdminPanel';

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<AppLayout />}>
        <Route index element={<ProjectList />} />
        <Route path="project/:id" element={<ProjectDetail />} />
        <Route path="admin" element={<AdminPanel />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

function NotFound() {
  const { t } = useTranslation();
  return (
    <div style={{ textAlign: 'center', padding: 100 }}>
      <h2>{t('common.notFound')}</h2>
    </div>
  );
}

export default AppRoutes;
