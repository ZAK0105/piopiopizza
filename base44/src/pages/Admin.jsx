import { useEffect } from 'react';
import '@/piopio/admin.css';
import '@/piopio/backend.js';
import { adminHtml } from '@/piopio/markup.js';

// The admin dashboard: overview, kitchen board, orders, menu and settings. Logic lives in src/piopio/admin.js.
export default function Admin() {
  useEffect(() => {
    document.title = 'Pio Pio Admin';
    import('@/piopio/admin.js');
  }, []);
  return <div dangerouslySetInnerHTML={{ __html: adminHtml }} />;
}
