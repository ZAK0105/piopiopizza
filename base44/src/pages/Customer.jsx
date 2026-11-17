import { useEffect } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import '@/piopio/app.css';
import '@/piopio/backend.js';
import { customerHtml } from '@/piopio/markup.js';
import { images } from '@/piopio/images.js';

// The customer ordering app. Its markup and logic live in src/piopio (plain JS, shared with the stand-alone version).
export default function Customer() {
  useEffect(() => {
    document.title = 'Pio Pio Pizza';
    window.PP_IMAGES = images;
    window.L = L; // the tracker draws the driver on an OpenStreetMap map when Leaflet is present
    import('@/piopio/app.js');
  }, []);
  return <div dangerouslySetInnerHTML={{ __html: customerHtml }} />;
}
