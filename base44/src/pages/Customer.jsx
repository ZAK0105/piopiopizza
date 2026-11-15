import { useEffect } from 'react';
import '@/piopio/app.css';
import '@/piopio/backend.js';
import { customerHtml } from '@/piopio/markup.js';
import { images } from '@/piopio/images.js';

// The customer ordering app. Its markup and logic live in src/piopio (plain JS, shared with the stand-alone version).
export default function Customer() {
  useEffect(() => {
    document.title = 'Pio Pio Pizza';
    window.PP_IMAGES = images;
    import('@/piopio/app.js');
  }, []);
  return <div dangerouslySetInnerHTML={{ __html: customerHtml }} />;
}
