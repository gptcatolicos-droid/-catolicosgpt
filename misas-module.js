// ════════════════════════════════════════════════════════════════
// MISAS MODULE — Directorio de canales de YouTube que transmiten Misa
// Canales organizados por país con slugs
// ════════════════════════════════════════════════════════════════

const MISAS_CANALES = [
  {
    pais: "Internacional",
    slug: "internacional",
    canales: [
      {
        nombre: "Vatican News - Español",
        slug: "vatican-news",
        canalId: "UCxIsefyl9g9A5SGWA4FvGIA",
        link: "https://www.youtube.com/@VaticanNewsES",
        liveUrl: "https://www.youtube.com/@VaticanNewsES/live",
        comentario: "Transmisiones oficiales del Papa Francisco y celebraciones del Vaticano."
      },
      {
        nombre: "EWTN Español",
        slug: "ewtn-espanol",
        canalId: "UCv9tN9cKuxQ1Z8752vA_q2Q",
        link: "https://www.youtube.com/@EWTNespanol",
        liveUrl: "https://www.youtube.com/@EWTNespanol/live",
        comentario: "Santa Misa diaria desde los estudios de EWTN en Alabama."
      },
      {
        nombre: "Magnificat TV",
        slug: "magnificat-tv",
        canalId: "UCYInYvLzC20W0uO-4S3F0_Q",
        link: "https://www.youtube.com/@MagnificatTV_asociacion",
        liveUrl: "https://www.youtube.com/@MagnificatTV_asociacion/live",
        comentario: "Iniciativa de la Asociación de Teología y Filosofía, España."
      }
    ]
  },
  {
    pais: "Colombia",
    slug: "colombia",
    canales: [
      {
        nombre: "Minuto de Dios",
        slug: "minuto-de-diose",
        canalId: "UCuT66yY9_yA7WbB6Wp-3t8w",
        link: "https://www.youtube.com/@MinutodeDiosOficial",
        liveUrl: "https://www.youtube.com/@MinutodeDiosOficial/live",
        comentario: "Misa diaria y celebraciones carismáticas desde Bogotá."
      },
      {
        nombre: "Santuario de Monserrate",
        slug: "santuario-de-monserrate",
        canalId: "UCuEOn-V87_d-r8s68uun-1Q",
        link: "https://www.youtube.com/@SantuariodeMonserrate",
        liveUrl: "https://www.youtube.com/@SantuariodeMonserrate/live",
        comentario: "Misa desde el cerro tutelar más famoso de Bogotá."
      }
    ]
  },
  {
    pais: "México",
    slug: "mexico",
    canales: [
      {
        nombre: "Insigne y Nacional Basílica de Guadalupe",
        slug: "basilica-de-guadalupe",
        canalId: "UC2UvL9v-tEAtB6lId74W4pA",
        link: "https://www.youtube.com/@BasilicadeGuadalupeOficial",
        liveUrl: "https://www.youtube.com/@BasilicadeGuadalupeOficial/live",
        comentario: "Transmisiones desde el santuario mariano más visitado del mundo."
      }
    ]
  }
];

function getMisasCanales() { return MISAS_CANALES; }
function getCanalBySlug(slug) {
  for (const p of MISAS_CANALES) {
    const c = p.canales.find(c => c.slug === slug);
    if (c) return { ...c, pais: p.pais };
  }
  return null;
}

module.exports = { getMisasCanales, getCanalBySlug };
