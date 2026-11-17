import { useEffect } from 'react';
import '@/piopio/staff.css';
import '@/piopio/backend.js';
import { staffHtml } from '@/piopio/markup.js';

// The staff dashboard for drivers and kitchen staff, made for a phone. Logic lives in src/piopio/staff.js.
export default function Staff() {
  useEffect(() => {
    document.title = 'Pio Pio Staff';
    import('@/piopio/staff.js');
  }, []);
  return <div dangerouslySetInnerHTML={{ __html: staffHtml }} />;
}
