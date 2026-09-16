# CatólicosGPT

CatólicosGPT es una experiencia web en español para consultar Biblia, Catecismo, Magisterio, liturgia, oración y catequesis. La portada incorpora un agente cuya prioridad es la trazabilidad de las fuentes.

## Principio de fuentes

La ruta principal del agente sigue esta jerarquía:

1. **Magisterium API** es la fuente doctrinal primaria: Chat devuelve respuesta, citas y preguntas relacionadas; Search permite descubrir fuentes estructuradas.
2. **OpenAI (opcional)** actúa únicamente como editor conversacional de una respuesta que Magisterium ya produjo. No recibe ni crea doctrina sin una respuesta fuente previa, y las citas se conservan separadas en la interfaz.
3. Si Magisterium no está configurado o no está disponible, la aplicación muestra un **respaldo local claramente etiquetado**. Son extractos del corpus local con origen identificado; no se presentan como resultados de Magisterium ni se completan con IA generativa.

La conexión **Magisterium Connect/MCP** es una autorización OAuth de usuario para clientes compatibles y no sustituye la API server-to-server usada aquí. Para este proyecto se configura una clave de API de Magisterium en el servidor.

## Ejecutar localmente

Requisitos: Node.js 20+.

```bash
npm ci
cp .env.example .env
# Completa al menos MAGISTERIUM_API_KEY para respuestas fuente en la portada.
npm run dev
```

El servidor queda disponible en `http://localhost:3000`. Nunca añadas `.env` al control de versiones.

### Variables principales

| Variable | Uso |
| --- | --- |
| `MAGISTERIUM_API_KEY` | Requerida para Chat y Search con fuentes de Magisterium. |
| `MAGISTERIUM_API_BASE` | Por defecto `https://www.magisterium.com/api/v1`. |
| `MAGISTERIUM_MODEL` | Por defecto `magisterium-1`. |
| `OPENAI_API_KEY` | Opcional; mejora estructura y claridad sólo sobre texto fuente de Magisterium. |
| `OPENAI_API_BASE` | Opcional; por defecto usa `https://api.openai.com/v1`. |
| `OPENAI_PRESENTATION_ENABLED` | Usa `0` para devolver el texto fuente sin edición conversacional. |
| `APP_URL` | Dominio público canónico usado para SEO, sitemap y datos estructurados. |
| `JWT_SECRET` | Secreto de sesiones de las rutas existentes. |

## Rutas del agente

- `GET /` — Interfaz exterior del agente CatólicosGPT.
- `POST /api/chat` — Chat. El contrato nuevo acepta `{ messages, mode, stream: true }` y emite SSE con `delta`, `meta` (citas, preguntas relacionadas y proveedor) y `done`. El contrato histórico `{ query }` sigue entregando texto progresivo.
- `POST /api/magisterium/search` — Búsqueda de fuentes con `{ query, category, numResults }`; las categorías admitidas son `auto`, `magisterial` y `scholarly`.
- `GET /api/agent/status` — Estado público de configuración, sin exponer secretos.

## SEO técnico

El SSR publica canonical URLs, meta robots, Open Graph/X y JSON-LD `WebSite`/`Organization`. `sitemap.xml` se genera dinámicamente a partir de las rutas públicas y `robots.txt` anuncia este sitemap. Los iconos de 16, 32, 48, 192 y 512 píxeles, junto con el manifest, están disponibles desde `public/` para favorecer una representación correcta del favicon en buscadores.

## Verificación

```bash
npm test
node --check server.js
```

Las pruebas son unitarias y no requieren claves ni realizan llamadas autenticadas a servicios externos.
