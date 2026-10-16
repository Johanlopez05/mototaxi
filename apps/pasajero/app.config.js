// Extiende app.json con lo que no debe quedar escrito en el repositorio.
// La llave de Google Maps (Android) sale del .env: EXPO_PUBLIC_GOOGLE_MAPS_API_KEY.
// En Google Cloud: habilita "Maps SDK for Android" y restringe la llave al paquete
// co.mototaxi.pasajero con el SHA-1 de EAS (Configure → Credentials).
module.exports = ({ config }) => ({
  ...config,
  plugins: [
    ...(config.plugins ?? []),
    ['react-native-maps', { androidGoogleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY }],
  ],
});
