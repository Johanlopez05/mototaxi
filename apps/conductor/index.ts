// La tarea de ubicación en segundo plano debe definirse antes que todo lo demás:
// Android puede abrir la app sin pantalla solo para ejecutarla.
import './src/lib/location';

import { registerRootComponent } from 'expo';
import App from './App';

registerRootComponent(App);
