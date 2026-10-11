# Camilo Walk — GPS Test

Prototipo PWA personal para Android.

## Qué hace
- GPS en tiempo real.
- Distancia recorrida.
- Tiempo de recorrido.
- Velocidad aproximada.
- Ruta dibujada sobre OpenStreetMap.
- Pasos aproximados calculados desde la distancia.
- Contador experimental mediante sensor de movimiento.
- Historial local de recorridos.
- Instalación como PWA desde Chrome.

## Importante
La geolocalización del navegador requiere un origen seguro:
- `https://...`
- o `localhost` durante desarrollo.

Abrir `index.html` directamente desde el almacenamiento del teléfono (`file://`) puede impedir el GPS y la instalación PWA.

## Forma más sencilla de probarlo en Android
1. Sube el contenido de esta carpeta a un hosting HTTPS estático, por ejemplo GitHub Pages, Netlify o Cloudflare Pages.
2. Abre la URL en Chrome para Android.
3. Acepta el permiso de ubicación y usa ubicación precisa.
4. Pulsa **Comenzar recorrido**.
5. Si Chrome muestra "Instalar app" / "Añadir a pantalla de inicio", úsalo para instalar la PWA.

## Prueba en computadora
Puedes servir la carpeta en localhost:
`python -m http.server 8080`

Luego abre:
`http://localhost:8080`

En Chrome DevTools puedes simular coordenadas desde Sensors > Location.

## Notas
- El mapa necesita internet para descargar mosaicos de OpenStreetMap.
- La ruta y los datos básicos siguen siendo lógica local.
- El contador "Pasos aprox." utiliza una zancada fija de 0,75 m; es útil para prueba, no como podómetro médico.
- El contador por sensores es experimental y puede contar de más o de menos según cómo lleves el teléfono.
- Se filtran posiciones GPS de muy baja precisión y saltos poco plausibles para reducir falsas distancias.
