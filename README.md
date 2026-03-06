# Diagram-to-PNG API

API serverless en Vercel que convierte diagramas Mermaid y draw.io (XML) a imágenes PNG con fondo transparente.

## Endpoint

```
POST /api/diagram-to-png
POST /convert  (alias)
```

## Parámetros del request (JSON body)

| Parámetro    | Tipo     | Requerido | Default     | Descripción                                        |
|-------------|----------|-----------|-------------|----------------------------------------------------|
| `content`   | string   | Sí        | —           | Código Mermaid o XML de draw.io                    |
| `type`      | string   | No        | auto-detect | `"mermaid"` o `"drawio"`. Si se omite, se detecta automáticamente |
| `width`     | number   | No        | 1920        | Ancho del viewport en px (min: 320, max: 3840)     |
| `height`    | number   | No        | 1080        | Alto del viewport en px (min: 240, max: 2160)      |
| `scale`     | number   | No        | 2           | Factor de escala (1-4). Con scale=2 y width=1920, el PNG resultante es 3840px de ancho |
| `theme`     | string   | No        | `"default"` | Solo Mermaid. Valores: `default`, `dark`, `forest`, `neutral`, `base` |
| `fontFamily`| string   | No        | —           | Solo Mermaid. Nombre de la fuente (se intenta cargar desde Google Fonts automáticamente) |
| `fontSize`  | string   | No        | —           | Solo Mermaid. Tamaño de fuente, ej: `"16px"`, `"14px"` |

## Respuesta

- **Éxito (200)**: Imagen PNG binaria con `Content-Type: image/png`
- **Error (400/405/500)**: JSON con `{ "error": "...", "details": "..." }`

## Auto-detección de formato

Si no se envía `type`, la API detecta el formato así:
- Si `content` contiene `<mxfile`, `<mxGraphModel`, o empieza con `<diagram` → se trata como **draw.io XML**
- Cualquier otra cosa → se trata como **Mermaid**

## Ejemplos de uso con curl

### Mermaid básico

```bash
curl -X POST https://TU-APP.vercel.app/api/diagram-to-png \
  -H "Content-Type: application/json" \
  -d '{"content": "graph TD\n  A[Inicio] --> B[Proceso]\n  B --> C[Fin]"}' \
  --output diagrama.png
```

### Mermaid con tema oscuro y fuente personalizada

```bash
curl -X POST https://TU-APP.vercel.app/convert \
  -H "Content-Type: application/json" \
  -d '{
    "content": "sequenceDiagram\n  Alice->>Bob: Hola\n  Bob-->>Alice: Hola!",
    "theme": "dark",
    "fontFamily": "Roboto",
    "fontSize": "14px"
  }' \
  --output diagrama.png
```

### Tamaño slide (16:9 Full HD retina)

```bash
curl -X POST https://TU-APP.vercel.app/convert \
  -H "Content-Type: application/json" \
  -d '{
    "content": "graph LR\n  A --> B --> C",
    "width": 1920,
    "height": 1080,
    "scale": 2
  }' \
  --output slide.png
```

Esto genera un PNG de **3840x2160px** (perfecto para presentaciones).

### draw.io XML

```bash
curl -X POST https://TU-APP.vercel.app/convert \
  -H "Content-Type: application/json" \
  -d '{"content": "<mxfile><diagram name=\"Page-1\">...XML aquí...</diagram></mxfile>"}' \
  --output arquitectura.png
```

## Guía para LLMs (Claude, ChatGPT, etc.)

Esta sección está diseñada para que un modelo de lenguaje pueda generar llamadas correctas a esta API.

### Instrucciones para el LLM

Cuando un usuario te pida generar un diagrama como imagen PNG, sigue estos pasos:

1. **Genera el código del diagrama** (Mermaid o draw.io XML) según lo que el usuario necesite.
2. **Construye el JSON body** con el campo `content` y los parámetros opcionales.
3. **Haz un POST** al endpoint `/api/diagram-to-png` o `/convert`.
4. **No necesitas especificar `type`** — la API lo detecta automáticamente.

### Qué formato usar según el caso

| Caso de uso | Formato recomendado | Razón |
|---|---|---|
| Flowcharts, diagramas de secuencia, Gantt, ER | **Mermaid** | Sintaxis simple de texto |
| Arquitectura cloud (AWS, Azure, GCP) con iconos | **draw.io** | Soporta stencils/iconos de proveedores |
| Diagramas de red con iconos específicos | **draw.io** | Librería de iconos completa |
| Diagramas simples y rápidos | **Mermaid** | Menos código, más fácil de generar |
| Diagramas que el usuario ya tiene en draw.io | **draw.io** | Solo pegar el XML |

### Plantilla de request para Mermaid

```json
{
  "content": "<código mermaid aquí>",
  "width": 1920,
  "height": 1080,
  "scale": 2,
  "theme": "default",
  "fontFamily": "Inter",
  "fontSize": "14px"
}
```

### Plantilla de request para draw.io

```json
{
  "content": "<mxfile>...XML completo del diagrama...</mxfile>",
  "width": 1920,
  "height": 1080,
  "scale": 2
}
```

### Tamaños recomendados para presentaciones

| Uso | width | height | scale | Resolución PNG resultante |
|-----|-------|--------|-------|--------------------------|
| Slide 16:9 HD | 1920 | 1080 | 1 | 1920×1080 |
| Slide 16:9 Retina | 1920 | 1080 | 2 | 3840×2160 |
| Slide 4:3 | 1024 | 768 | 2 | 2048×1536 |
| Documentación web | 800 | 600 | 2 | 1600×1200 |
| Thumbnail | 400 | 300 | 1 | 400×300 |

### Tipos de diagrama Mermaid soportados

```
graph / flowchart    - Diagramas de flujo
sequenceDiagram      - Diagramas de secuencia
classDiagram         - Diagramas de clases
stateDiagram-v2      - Diagramas de estado
erDiagram            - Entidad-relación
gantt                - Gantt
pie                  - Gráficos de pastel
gitgraph             - Historial git
mindmap              - Mapas mentales
timeline             - Líneas de tiempo
sankey-beta          - Diagramas Sankey
```

### Temas Mermaid disponibles

| Tema | Descripción |
|------|-------------|
| `default` | Colores estándar, fondo claro |
| `dark` | Tema oscuro, ideal para fondos negros |
| `forest` | Tonos verdes |
| `neutral` | Escala de grises, profesional |
| `base` | Tema base para personalización avanzada |

## Limitaciones importantes

### Fuentes

- **Fuentes disponibles en el servidor**: Solo las fuentes del sistema incluidas en Chromium headless (Arial, Helvetica, Times New Roman, Courier, sans-serif, serif, monospace).
- **Google Fonts (solo Mermaid)**: Si envías `fontFamily`, la API intenta cargar esa fuente desde Google Fonts. Funciona con fuentes populares como Roboto, Inter, Open Sans, Lato, etc. Si la fuente no existe en Google Fonts, se hace fallback a sans-serif.
- **draw.io**: Las fuentes se definen dentro del XML del diagrama. Si el diagrama usa una fuente que no está en el servidor, se sustituye por una genérica. Para resultados consistentes, usa fuentes estándar (Arial, Helvetica) al diseñar en draw.io.

### Iconos y stencils

- **draw.io**: Soporta completamente iconos de AWS, Azure, GCP, Kubernetes, redes, etc. El viewer.diagrams.net carga todas las librerías de stencils. Los iconos deben estar embebidos en el XML (lo hace draw.io automáticamente al exportar).
- **Mermaid**: No soporta iconos de proveedores cloud nativamente. Soporta iconos FontAwesome con sintaxis `fa:fa-icon-name` en nodos. Para arquitectura cloud con iconos, usa draw.io.

### Rendimiento

- **Cold start**: La primera invocación tarda 5-15 segundos (descarga de Chromium ~40MB + inicialización). Las invocaciones siguientes en la misma instancia reutilizan el browser y son mucho más rápidas (1-3s).
- **Tamaño máximo de input**: 500KB de contenido. Diagramas extremadamente grandes pueden fallar por memoria.
- **Timeout**: 60 segundos máximo por request.
- **Plan Vercel recomendado**: Pro. El plan Hobby tiene un límite de 10 segundos que es insuficiente para cold starts.

### Fondo transparente

- Las imágenes se generan con fondo **transparente** por defecto.
- Si necesitas fondo blanco, añade un fondo blanco en tu CSS/HTML al usar la imagen, o procesa el PNG después.

### draw.io XML

- El XML puede ser comprimido (deflated + base64) o en texto plano — el viewer lo maneja automáticamente.
- Para obtener el XML de un diagrama draw.io: Archivo → Exportar como → XML, o copiar el contenido del archivo `.drawio`.
- Los parámetros `theme`, `fontFamily` y `fontSize` **NO aplican** a draw.io. Estas propiedades se controlan dentro del propio diagrama XML.

### Límites de los parámetros

| Parámetro | Mínimo | Máximo | Notas |
|-----------|--------|--------|-------|
| `width` | 320 | 3840 | En pixels del viewport |
| `height` | 240 | 2160 | En pixels del viewport |
| `scale` | 1 | 4 | Multiplica la resolución final |
| `content` | 1 char | 500KB | — |

## Stack técnico

- **Runtime**: Vercel Serverless Functions (Node.js)
- **Renderizado**: Puppeteer + @sparticuz/chromium-min (Chromium headless)
- **Mermaid**: Cargado desde CDN (jsdelivr), versión 11
- **draw.io viewer**: Cargado desde viewer.diagrams.net
- **Memoria**: 3009 MB (máximo en Vercel Pro)
