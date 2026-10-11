/** Geolocation helper for photo/video evidence (GPS metadata the chain can audit). */
export interface GpsFix {
  lat: number;
  lng: number;
  accuracy?: number;
  source: 'gps' | 'network' | 'manual';
}

export function getGps(timeoutMs = 8000): Promise<GpsFix | undefined> {
  if (!('geolocation' in navigator)) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, source: 'gps' }),
      () => resolve(undefined),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60000 },
    );
  });
}