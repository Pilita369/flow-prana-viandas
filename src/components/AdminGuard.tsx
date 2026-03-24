import { ReactNode, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function AdminGuard({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  useEffect(() => {
    if (sessionStorage.getItem('mp_admin') !== 'true') {
      navigate('/admin/login');
    }
  }, [navigate]);
  
  if (sessionStorage.getItem('mp_admin') !== 'true') return null;
  return <>{children}</>;
}
