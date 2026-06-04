# CatolicosGPT V6.0 — Deploy

## ⚠️ PASO 1 ANTES DE TODO: Migrar a Cloudinary

Tus 33 infografías son seguras — viven en el Render Disk. El deploy NO las toca.

**PERO** las imágenes locales en `/public/infografias/*.jpg` SÍ son frágiles. El primer paso después del deploy es:

1. Ve a `/admin` → tab **Configuración**
2. Click en **"🛡️ Migrar TODAS las imágenes locales a Cloudinary"**
3. Espera 1-5 minutos
4. Reporte: cuántas se migraron, errores, etc.

**SEO garantizado:** los slugs NO cambian. `catolicosgpt.com/infografias/corpus-christi` sigue funcionando idéntico.

---

## 🆕 Features V6.0

1. **Bug chat duplicado** — corregido + cursor café removido
2. **Force Cloudinary** — sin fallback local (Opción A)
3. **Infografías reorganizadas** — galería primero, `/infografias/crear` separado
4. **Blog completo** — Markdown + IA SEO + shortcodes `[infografia:slug]`, `[video:slug]`, `[podcast:slug]`
5. **Podcasts multi-plataforma** — Spotify, Apple, SoundCloud, Ivoox, YouTube
6. **Alt-text editor SEO** — modal en lista admin de infografías
7. **Menú reorganizado** — Infografías primero, +Blog, +Podcast

## 🚀 Deploy en Render

1. Commit + push del ZIP
2. Verificar env vars: `CLOUDINARY_*`, `DATA_DIR=/data`, `OPENAI_API_KEY`
3. Disco `/data` montado (ya lo tienes)
4. Después del deploy: ejecutar **Migrar a Cloudinary** desde admin

## 📦 Endpoints nuevos

- `POST /api/admin/migrate-to-cloudinary` ← crítico
- `POST /api/admin/infografias/edit-meta` ← alt-text
- `GET/POST/DELETE /api/blog` + `/api/admin/blog/*`
- `GET/POST/DELETE /api/podcast` + `/api/admin/podcast/*`
- `GET /infografias/crear` ← página separada del generador

## ✅ Validación

- Sintaxis: 10/10 OK
- Features V6.0: 45/45 implementados
- Test pipeline Markdown+shortcodes: OK
- Test detección Spotify/Apple/SoundCloud/YouTube/Ivoox: OK
