function buildMapsDirectionsUrl(stops) {
  const encoded = (stops || [])
    .map((stop) => encodeURIComponent(String(stop || '').trim()))
    .filter(Boolean);
  if (!encoded.length) return '';
  if (encoded.length === 1) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encoded[0]}`;
  }
  const origin = encoded[0];
  const destination = encoded[encoded.length - 1];
  const waypoints = encoded.slice(1, -1).join('|');
  return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}${waypoints ? `&waypoints=${waypoints}` : ''}`;
}

module.exports = { buildMapsDirectionsUrl };
