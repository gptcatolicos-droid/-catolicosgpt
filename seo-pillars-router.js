// ════════════════════════════════════════════════════════════════════════════
// SEO PILLARS ROUTER — 10 Core Programmatic Catholic Pillars
// ════════════════════════════════════════════════════════════════════════════

const express = require('express');
const fs = require('fs');
const path = require('path');
const blog = require('./blog-module');
const auth = require('./auth-module');
const seoTopics = require('./seo-topics');
const bibliaModule = require('./biblia-module');

const router = express.Router();
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const CACHE_DIR = path.join(DATA_DIR, 'seo_cache');

if (!fs.existsSync(CACHE_DIR)) {
  try { fs.mkdirSync(CACHE_DIR, { recursive: true }); } catch (e) {}
}

// Lista estática de temas de los Pilares SEO (Satisface >100 URLs de Tráfico Principal y Blogs)
const CORE_PILLARS_TOPICS = {
  // Pilar 1: Contenido Diario
  '/oracion-del-dia': { tema: "Oración del Día Católica", categoria: 'diario' },
  '/evangelio-del-dia': { tema: "Evangelio del Día Católico", categoria: 'diario' },
  '/lecturas-del-dia': { tema: "Lecturas de la Misa de Hoy", categoria: 'diario' },
  '/salmo-del-dia': { tema: "Salmo Responsorial del Día", categoria: 'diario' },
  '/rosario-del-dia': { tema: "Rosario del Día de Hoy", categoria: 'diario' },
  '/reflexion-del-dia': { tema: "Reflexión Espiritual del Día", categoria: 'diario' },
  '/frase-catolica-del-dia': { tema: "Frase Católica de Inspiración Diaria", categoria: 'diario' },
  '/intencion-del-dia': { tema: "Intención de Oración del Día de Hoy", categoria: 'diario' },
  '/calendario-liturgico': { tema: "Calendario Litúrgico Oficial de la Iglesia", categoria: 'diario' },

  // Pilar 2: Hub de Oraciones
  '/oraciones': { tema: "Oraciones Católicas Tradicionales y de Sanación", categoria: 'oraciones' },
  '/oraciones/manana': { tema: "Oración de la Mañana para Empezar el Día", categoria: 'oraciones' },
  '/oraciones/noche': { tema: "Oración de la Noche para entregar el descanso a Dios", categoria: 'oraciones' },
  '/oraciones/sanacion': { tema: "Oraciones de Sanación Física, Mental y Espiritual", categoria: 'oraciones' },
  '/oraciones/prosperidad': { tema: "Oración por la Prosperidad y Abundancia Cristiana", categoria: 'oraciones' },
  '/oraciones/trabajo': { tema: "Oración para Conseguir Trabajo o Bendecir el Negocio", categoria: 'oraciones' },
  '/oraciones/familia': { tema: "Oración por la Unión Familiar y la Paz en el Hogar", categoria: 'oraciones' },
  '/oraciones/hijos': { tema: "Oraciones para Proteger y Bendecir a los Hijos", categoria: 'oraciones' },
  '/oraciones/enfermos': { tema: "Oración por los Enfermos y la Salud de un Ser Querido", categoria: 'oraciones' },
  '/oraciones/difuntos': { tema: "Oraciones por los Difuntos y el Descanso Eterno (Fieles Difuntos)", categoria: 'oraciones' },
  '/oraciones/parejas': { tema: "Oración para Restaurar Matrimonios y Fortalecer Parejas", categoria: 'oraciones' },

  // Pilar 2 Oraciones Individuales (Keywords de altísimo tráfico en Google)
  '/oracion-padre-nuestro': { tema: "Oración del Padre Nuestro original completo", categoria: 'oraciones' },
  '/oracion-ave-maria': { tema: "Oración del Ave María en español y latín", categoria: 'oraciones' },
  '/oracion-salve': { tema: "Oración de la Salve Regina para consolar el alma", categoria: 'oraciones' },
  '/oracion-credo': { tema: "Oración del Credo: Símbolo de los Apóstoles", categoria: 'oraciones' },
  '/oracion-gloria': { tema: "Oración del Gloria al Padre: Doxología menor", categoria: 'oraciones' },
  '/oracion-al-espiritu-santo': { tema: "Oración al Espíritu Santo para pedir sabiduría", categoria: 'oraciones' },
  '/oracion-a-san-jose': { tema: "Oración a San José para pedir su protección", categoria: 'oraciones' },
  '/oracion-a-san-benito': { tema: "Oración de liberación y protección de San Benito", categoria: 'oraciones' },
  '/oracion-a-san-miguel': { tema: "Oración a San Miguel Arcángel de León XIII", categoria: 'oraciones' },
  '/oracion-a-la-virgen-maria': { tema: "Consagración mariana y oración a la Virgen María", categoria: 'oraciones' },
  '/oracion-de-sanacion': { tema: "Oración de sanación y restauración del alma", categoria: 'oraciones' },
  '/oracion-para-el-trabajo': { tema: "Oración para encontrar o bendecir el trabajo y negocio", categoria: 'oraciones' },
  '/oracion-para-dormir': { tema: "Oración para dormir en paz y entregar el descanso a Dios", categoria: 'oraciones' },
  '/oracion-por-la-familia': { tema: "Oración por la unión familiar y armonía del hogar", categoria: 'oraciones' },
  '/oracion-por-los-hijos': { tema: "Oración por la bendición de los hijos y su fe", categoria: 'oraciones' },
  '/oracion-por-los-enfermos': { tema: "Oración ferviente por la salud de los enfermos", categoria: 'oraciones' },
  '/oracion-de-liberacion': { tema: "Oración de liberación contra las asechanzas del maligno", categoria: 'oraciones' },
  '/oracion-de-proteccion': { tema: "Oración de protección espiritual para el hogar", categoria: 'oraciones' },
  '/oracion-de-agradecimiento': { tema: "Oración de agradecimiento por los favores recibidos", categoria: 'oraciones' },
  '/oracion-de-fe': { tema: "Oración de fe y aceptación de la Divina Voluntad", categoria: 'oraciones' },

  // Pilar 3: Hub del Rosario
  '/rosario': { tema: "El Santo Rosario Completo en Español: Cómo rezarlo paso a paso", categoria: 'rosario' },
  '/rosario-completo': { tema: "Guía completa del Santo Rosario y Oraciones Marianas", categoria: 'rosario' },
  '/rosario-lunes': { tema: "Santo Rosario del Lunes y Sábado: Misterios Gozosos", categoria: 'rosario' },
  '/rosario-martes': { tema: "Santo Rosario del Martes y Viernes: Misterios Dolorosos", categoria: 'rosario' },
  '/rosario-miercoles': { tema: "Santo Rosario del Miércoles y Domingo: Misterios Gloriosos", categoria: 'rosario' },
  '/rosario-jueves': { tema: "Santo Rosario del Jueves: Misterios Luminosos", categoria: 'rosario' },
  '/rosario-viernes': { tema: "Santo Rosario del Viernes: Meditación de los Misterios Dolorosos", categoria: 'rosario' },
  '/rosario-sabado': { tema: "Santo Rosario del Sábado: Meditación de los Misterios Gozosos", categoria: 'rosario' },
  '/rosario-domingo': { tema: "Santo Rosario del Domingo: Meditación de los Misterios Gloriosos", categoria: 'rosario' },
  '/misterios-gozosos': { tema: "Meditación de los Misterios Gozosos del Santo Rosario", categoria: 'rosario' },
  '/misterios-luminosos': { tema: "Meditación de los Misterios Luminosos del Santo Rosario", categoria: 'rosario' },
  '/misterios-dolorosos': { tema: "Meditación de los Misterios Dolorosos del Santo Rosario", categoria: 'rosario' },
  '/misterios-gloriosos': { tema: "Meditación de los Misterios Gloriosos del Santo Rosario", categoria: 'rosario' },

  // Pilar 5: Jesucristo
  '/jesus': { tema: "Jesucristo: Hijo de Dios, Salvador del Mundo y Redentor", categoria: 'jesus' },
  '/quien-es-jesus': { tema: "¿Quién es Jesús de Nazaret según el Dogma de la Iglesia Católica?", categoria: 'jesus' },
  '/milagros-de-jesus': { tema: "Los Milagros de Jesús en los Evangelios y su significado teológico", categoria: 'jesus' },
  '/parabolas-de-jesus': { tema: "Las Parábolas de Jesús explicadas según el Magisterio", categoria: 'jesus' },
  '/pasion-de-cristo': { tema: "La Pasión y Muerte de Nuestro Señor Jesucristo (Vía Crucis)", categoria: 'jesus' },
  '/resurreccion-de-jesus': { tema: "La Resurrección de Jesús: Victoria sobre el pecado y la muerte", categoria: 'jesus' },
  '/segunda-venida-de-cristo': { tema: "La Parusía o Segunda Venida de Cristo en la escatología católica", categoria: 'jesus' },
  '/enseñanzas-de-jesus': { tema: "Las principales enseñanzas de Jesús para vivir el Evangelio", categoria: 'jesus' },
  '/vida-de-jesus': { tema: "Biografía histórica y mística de Jesús de Nazaret", categoria: 'jesus' },

  // Pilar 6: Virgen María
  '/maria': { tema: "La Santísima Virgen María: Madre de Dios y Abogada Nuestra", categoria: 'maria' },
  '/virgen-maria': { tema: "Mariología y Dogmas Marianos de la Iglesia Católica", categoria: 'maria' },
  '/virgen-de-guadalupe': { tema: "La Virgen de Guadalupe y sus Apariciones milagrosas en el Tepeyac", categoria: 'maria' },
  '/virgen-del-carmen': { tema: "Nuestra Señora del Carmen y la devoción del Santo Escapulario", categoria: 'maria' },
  '/virgen-de-fatima': { tema: "La Virgen de Fátima, los tres pastorcitos y sus profecías reveladas", categoria: 'maria' },
  '/virgen-de-lourdes': { tema: "Nuestra Señora de Lourdes, apariciones de Bernadette y el agua milagrosa", categoria: 'maria' },
  '/inmaculada-concepcion': { tema: "El Dogma de la Inmaculada Concepción de la Virgen María", categoria: 'maria' },
  '/asuncion-de-maria': { tema: "El Dogma Católico de la Asunción de la Virgen María en cuerpo y alma", categoria: 'maria' },
  '/milagros-de-la-virgen': { tema: "Milagros marianos aprobados oficialmente por la Santa Sede", categoria: 'maria' },

  // Pilar 7: Santos (URLs directas para indexar)
  '/santos': { tema: "Vidas de los Santos: Ejemplos heroicos de Fe y Caridad del Martirologio Romano", categoria: 'santos' },
  '/santos/san-jose': { tema: "San José: Vida, patrocinio y devoción mística", categoria: 'santos' },
  '/santos/san-benito': { tema: "San Benito de Nursia: Regla benedictina y cruz sagrada", categoria: 'santos' },
  '/santos/san-francisco-de-asis': { tema: "San Francisco de Asís: Pobreza, milagros y mística", categoria: 'santos' },
  '/santos/san-agustin': { tema: "San Agustín de Hipona: Conversión, gracia y obras", categoria: 'santos' },
  '/santos/padre-pio': { tema: "San Pío de Pietrelcina: Estigmas duraderos y confesión mística", categoria: 'santos' },
  '/santos/san-juan-pablo-ii': { tema: "San Juan Pablo II: Totus Tuus, magisterio y misiones", categoria: 'santos' },

  // Pilar 8: Catecismo
  '/catecismo': { tema: "El Catecismo de la Iglesia Católica (CIC): Compendio oficial de nuestra Fe", categoria: 'catecismo' },
  '/los-10-mandamientos': { tema: "Los 10 Mandamientos de la Ley de Dios explicados según el Catecismo", categoria: 'catecismo' },
  '/los-sacramentos': { tema: "Los 7 Sacramentos de la Iglesia Católica: Fuentes de gracia divina", categoria: 'catecismo' },
  '/bautismo': { tema: "El Sacramento del Bautismo: Renovación espiritual, efectos e importancia", categoria: 'catecismo' },
  '/confirmacion': { tema: "El Sacramento de la Confirmación: Consagración del Espíritu Santo", categoria: 'catecismo' },
  '/eucaristia': { tema: "La Sagrada Eucaristía: Presencia real de Jesucristo (Transubstanciación)", categoria: 'catecismo' },
  '/confesion': { tema: "El Sacramento de la Confesión o Reconciliación: Perdón de los pecados", categoria: 'catecismo' },
  '/matrimonio': { tema: "El Sacramento del Matrimonio: Alianza indisoluble del amor conyugal", categoria: 'catecismo' },
  '/orden-sacerdotal': { tema: "El Sacramento del Orden Sacerdotal: Vocación ministerial del presbiterado", categoria: 'catecismo' },
  '/uncion-de-los-enfermos': { tema: "La Unción de los Enfermos: Gracia, alivio y fortaleza espiritual", categoria: 'catecismo' },

  // Pilar 9: Apologética
  '/apologetica': { tema: "Apologética Católica: Defensa razonada, bíblica e histórica de nuestra Fe", categoria: 'apologetica' },
  '/por-que-ser-catolico': { tema: "¿Por qué ser Católico? Razones bíblicas e históricas fundamentales", categoria: 'apologetica' },
  '/por-que-confesarse': { tema: "Defensa bíblica del por qué confesarse con un sacerdote", categoria: 'apologetica' },
  '/por-que-veneramos-a-maria': { tema: "Diferencia entre Adoración (Latría) y Veneración (Dulía) a la Virgen", categoria: 'apologetica' },
  '/el-purgatorio': { tema: "El Purgatorio en la Biblia y la tradición patrística católica", categoria: 'apologetica' },
  '/la-sucesion-apostolica': { tema: "La Sucesión Apostólica: Continuidad histórica desde San Pedro al Papa León XIV", categoria: 'apologetica' },
  '/la-eucaristia': { tema: "Defensa bíblica de la presencia real en la Hostia Santa", categoria: 'apologetica' },
  '/las-indulgencias': { tema: "Qué son las Indulgencias en la Iglesia Católica y cómo ganarlas", categoria: 'apologetica' },
  '/la-tradicion-apostolica': { tema: "Sagradas Escrituras y Tradición Apostólica: El depósito de la fe", categoria: 'apologetica' },

  // Pilar 10: Preguntas Católicas de alto volumen en Google
  '/pregunta/que-es-el-pecado': { tema: "Qué es el pecado venial y mortal según el catecismo", categoria: 'preguntas' },
  '/pregunta/que-es-la-eucaristia': { tema: "Qué es la Eucaristía y la presencia real en la Hostia", categoria: 'preguntas' },
  '/pregunta/quien-fue-san-pedro': { tema: "Quién fue San Pedro y cómo fundó el Primado de Roma", categoria: 'preguntas' },
  '/pregunta/por-que-se-reza-el-rosario': { tema: "Por qué los católicos rezamos el Santo Rosario de María", categoria: 'preguntas' }
};

// Generar o cargar contenido programático para un tema específico
async function getOrGenerateSEOPageContent(getAiFn, topic, urlPath) {
  const safeFilename = urlPath.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.json';
  const cacheFilePath = path.join(CACHE_DIR, safeFilename);

  // Intentar cargar desde el disco local
  if (fs.existsSync(cacheFilePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(cacheFilePath, 'utf8'));
      if (data && data.content) return data;
    } catch (e) {
      console.error(`[SEO-Pillars] Error cargando cache de ${urlPath}:`, e.message);
    }
  }

  // Si no está en disco, generar con Gemini para que sea 100% auténtica e increíble
  const ai = getAiFn();
  let pageObject = {
    title: topic,
    seoTitle: `${topic} — CatólicosGPT`,
    metaDescription: `Análisis doctrinal completo sobre ${topic} según el Catecismo de la Iglesia Católica y el Magisterio apostólico oficial.`,
    keywords: `${topic.toLowerCase()}, catecismo catolico, magisterio de la iglesia, doctrina catolica drecta, teologia catolica`,
    h1: topic,
    intro: `Exploración y estudio en profundidad sobre: ${topic}. Descubre la riqueza de las verdades católicas.`,
    content: `## Introducción\nEl misterio de ${topic} pertenece a la profunda herencia divina confiada a la Santa Iglesia Católica. A continuación, exploraremos detenidamente sus raíces bíblicas, lo que el Catecismo de la Iglesia Católica enseña para nuestra formación moral y espiritual y cómo vivirlo a ejemplo del legado apostólico.\n\n## Fundamento Teológico e Histórico\nLa Revelación Divina nos muestra la verdad sobre este aspecto. Los Santos Padres y los grandes concilios ecuménicos han definido con precisión el alcance salvífico de estas realidades, protegiendo las almas del relativismo moderno.\n\n## Importancia Pastoral en la Vida Diaria\nAcogernos a la fe nos permite crecer en las virtudes teologales. La guía espiritual de la Iglesia es el faro perfecto.\n\n| Virtud Relacionada | Práctica Cristiana Diaria |\n| :--- | :--- |\n| Fe | Oración constante y estudio del Catecismo |\n| Esperanza | Confianza plena en las promesas del Señor |\n| Caridad | Obras de misericordia corporales y espirituales |\n\n## Reflexión y Jaculatoria Final\nConcedemos, Señor, la gracia de amar tu doctrina santa y caminar con obediencia pastoral bajo el pontificado de León XIV. Amén.`,
    faqs: [
      { q: `¿Qué significa exactamente ${topic}?`, a: `Representa un principio de fe crucial en la Iglesia Católica, amparado por las Sagradas Escrituras y custodiado por el Magisterio.` },
      { q: `¿Cómo podemos aplicar las verdades de ${topic} en nuestro día a día?`, a: `Viviendo con perseverancia los sacramentos, practicando las virtudes de fe y participando fervientemente en las devociones católicas tradicionales.` }
    ]
  };

  if (ai) {
    try {
      console.log(`[SEO-Pillars] Generando página SEO con Gemini para URL: ${urlPath}...`);
      const prompt = `Actúa como un teólogo católico y estratega SEO principal de CatólicosGPT, la IA Católica #1 en español.
Queremos crear una página doctrinal de altísima calidad, profunda, hermosa y formativa (de más de 500 palabras) para el tema: "${topic}" en la URL: "${urlPath}".
La respuesta debe ser fiel 100% al Catecismo de la Iglesia Católica (CIC), las Escrituras y al Papa León XIV (Robert Francis Prevost).

Devuelve exclusivamente un JSON válido en español, sin bloques markdown y sin \`\`\`json:
{
  "title": "Nombre legible del tema principal, peregrino o místico",
  "seoTitle": "Título SEO ultra-optimizado optimizado de menos de 65 caracteres, p. ej. 'El Santo Rosario Completo: Guía de Oración y Misterios'",
  "metaDescription": "Meta Description persuasiva de menos de 155 caracteres destacando que somos la IA #1 católica",
  "keywords": "palabra clave 1, palabra clave 2, catecismo catolico, papa leon xiv, magisterio de la iglesia",
  "h1": "Título llamativo principal H1 sobre el tema",
  "intro": "Párrafo introductorio místico, acogedor y pastoral de unas 60-80 palabras",
  "content": "Desarrollo completo teológico en markdown con subencabezados (##), listas, viñetas, citas doctrinales con sus números correspondientes del Catecismo, y una tabla comparativa o cuadro de virtudes en Markdown para organizar la lectura.",
  "faqs": [
    { "q": "Pregunta frecuente práctica 1 sobre el tema", "a": "Respuesta doctrinalmente perfecta basada en el Catecismo de la Iglesia" },
    { "q": "Pregunta frecuente práctica 2 sobre el tema", "a": "Respuesta teológica y esperanzadora..." },
    { "q": "Pregunta frecuente práctica 3 sobre el tema", "a": "Respuesta formativa adicional..." }
  ]
}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: prompt
      });

      let text = response.text || '';
      text = text.replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(text);
      if (parsed.content && parsed.seoTitle) {
        pageObject = { ...pageObject, ...parsed };
        // Guardar en la cache local para velocidades de acceso instantáneas (Programmatic SEO)
        fs.writeFileSync(cacheFilePath, JSON.stringify(pageObject, null, 2), 'utf8');
        console.log(`[SEO-Pillars] Cache escrita correctamente para: ${urlPath}`);
      }
    } catch (e) {
      console.error(`[SEO-Pillars] Falló la generación de IA para ${urlPath}. Usando plantilla local de contingencia. Error:`, e.message);
    }
  }

  return pageObject;
}

// Helper para obtener 5 enlaces de santos de forma dinámica
function getRandomSaintsLinks() {
  const list = [
    { n: 'San José, Patrono de la Iglesia', s: 'san-jose' },
    { n: 'San Benito de Nursia', s: 'san-benito' },
    { n: 'San Antonio de Padua', s: 'san-antonio-de-padua' },
    { n: 'San Francisco de Asís', s: 'san-francisco-de-asis' },
    { n: 'Santa Teresita del Niño Jesús', s: 'santa-teresita' },
    { n: 'San Ignacio de Loyola', s: 'san-ignacio' },
    { n: 'San Agustín de Hipona', s: 'san-agustin' },
    { n: 'Santo Tomás de Aquino', s: 'santo-tomas-de-aquino' },
    { n: 'San Pío de Pietrelcina', s: 'padre-pio' }
  ];
  return list.sort(() => 0.5 - Math.random()).slice(0, 5);
}

// Helper para obtener 5 preguntas católicas frecuentes para cross-linking
function getRandomQuestionsLinks() {
  const list = [
    { n: '¿Qué es el pecado grave o mortal según el catecismo?', s: 'que-es-el-pecado' },
    { n: '¿Por qué nos confesamos ante un sacerdote humano?', s: 'por-que-confesarse' },
    { n: '¿Cuál es el valor infinito del Santo Sacrificio de la Misa?', s: 'que-es-la-eucaristia' },
    { n: '¿Por qué los católicos veneramos a la Virgen María?', s: 'por-que-veneramos-a-maria' },
    { n: '¿Qué es el Purgatorio y qué enseña la Biblia al respecto?', s: 'el-purgatorio' },
    { n: '¿Quién fue San Pedro y cómo se originó el papado?', s: 'quien-fue-san-pedro' },
    { n: '¿Cuál es la importancia de rezar el Rosario todos los días?', s: 'por-que-se-reza-el-rosario' }
  ];
  return list.sort(() => 0.5 - Math.random()).slice(0, 5);
}

// Renderizar la página HTML con plantilla sagrada y optimización visual
function renderSEOPage(req, pageData, relatedData) {
  // Generar JSON-LD de las FAQ Schema para SEO enriquecido de Google
  const faqsJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": pageData.faqs.map(f => ({
      "@type": "Question",
      "name": f.q,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": f.a
      }
    }))
  };

  // Generar Breadcrumb Schema.org
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      {
        "@type": "ListItem",
        "position": 1,
        "name": "Inicio",
        "item": "https://www.catolicosgpt.com/"
      },
      {
        "@type": "ListItem",
        "position": 2,
        "name": pageData.title,
        "item": `https://www.catolicosgpt.com${req.originalUrl}`
      }
    ]
  };

  // Convertir markdown a HTML seguro
  let mdHtml = '';
  try {
    if (global.marked) {
      mdHtml = global.marked.parse(pageData.content);
    } else {
      // Intento fallback básico a markdown si global marked no cargó
      const marked = require('marked');
      mdHtml = marked.parse(pageData.content);
    }
  } catch(e) {
    // Reemplazo simple
    mdHtml = pageData.content
      .replace(/## (.*)/g, '<h2 class="font-display font-semibold text-lg text-maroon mt-6 border-b pb-1.5">$1</h2>')
      .replace(/# (.*)/g, '<h1 class="font-display font-bold text-2xl text-maroon mt-4">$1</h1>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n\n/g, '<p class="my-3 leading-relaxed"></p>');
  }

  // Estructura de links de recomendación solicitada por el usuario
  let relatedHtml = `
    <!-- SISTEMA DE RECOMENDACIÓN CRUZADA SEO PROGRAMÁTICO -->
    <div class="mt-12 pt-8 border-t border-border flex flex-col gap-6">
      <h3 class="font-display font-semibold text-base text-maroon uppercase tracking-wider">Recursos y Devociones Recomendadas</h3>
      
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs sm:text-sm">
        <!-- Santos Relacionados -->
        <div class="bg-white border rounded-xl p-4 shadow-sm flex flex-col gap-2.5">
          <h4 class="font-display font-bold text-maroon uppercase tracking-wider text-[11px] border-b pb-1">😇 5 Santos de Devoción</h4>
          <ul class="flex flex-col gap-1.5">
  `;

  relatedData.saints.forEach(s => {
    relatedHtml += `<li><a href="/santos/${s.s}" class="hover:underline text-ink hover:text-maroon font-medium flex items-center gap-1.5">&#x271F; ${s.n}</a></li>`;
  });

  relatedHtml += `
          </ul>
        </div>

        <!-- Preguntas Relacionadas -->
        <div class="bg-white border rounded-xl p-4 shadow-sm flex flex-col gap-2.5">
          <h4 class="font-display font-bold text-maroon uppercase tracking-wider text-[11px] border-b pb-1">❓ 5 Preguntas Resueltas</h4>
          <ul class="flex flex-col gap-1.5">
  `;

  relatedData.questions.forEach(q => {
    relatedHtml += `<li><a href="/pregunta/${q.s}" class="hover:underline text-ink hover:text-maroon font-medium flex items-center gap-1.5">&#x271F; ${q.n}</a></li>`;
  });

  relatedHtml += `
          </ul>
        </div>

        <!-- Artículos de Formación Relacionados -->
        <div class="bg-white border rounded-xl p-4 shadow-sm flex flex-col gap-2.5">
          <h4 class="font-display font-bold text-maroon uppercase tracking-wider text-[11px] border-b pb-1">📖 5 Artículos de Doctrina</h4>
          <ul class="flex flex-col gap-1.5">
  `;

  relatedData.articles.forEach(a => {
    relatedHtml += `<li><a href="/blog/${a.slug}" class="hover:underline text-ink hover:text-maroon font-medium flex items-center gap-1.5">&#x271F; ${a.titulo}</a></li>`;
  });

  relatedHtml += `
          </ul>
        </div>
      </div>
      
      <!-- Enlace Mandatorio a Oración del día para Interconexión Óptima -->
      <div class="bg-cream-2 border border-gold/30 rounded-xl p-5 text-center mt-3">
        <h4 class="font-display font-bold text-maroon text-sm flex items-center justify-center gap-1.5 uppercase tracking-wide">💡 Rezo de Comunión Cotidiana</h4>
        <p class="text-xs text-ink-2 mt-1.5">Consagremos nuestra jornada en oración comunitaria ante el Santísimo Sacramento.</p>
        <a href="/oracion-del-dia" class="inline-block mt-3 px-5 py-2.5 bg-maroon text-white font-bold text-xs uppercase tracking-wider rounded-full transition shadow duration-200 hover:bg-gold-deep active:scale-95">Rezar la Oración del Día de Hoy &rarr;</a>
      </div>
    </div>
  `;

  // FAQ Acordeones Renderizados
  let faqsHtml = '';
  if (pageData.faqs && pageData.faqs.length > 0) {
    faqsHtml += `
      <div class="mt-10 bg-white border rounded-xl p-5 sm:p-7 shadow-sm">
        <h3 class="font-display font-semibold text-base text-maroon mb-5 uppercase tracking-widest border-b pb-2">Preguntas Frecuentes (FAQ)</h3>
        <div class="flex flex-col gap-4">
    `;

    pageData.faqs.forEach((f, idx) => {
      faqsHtml += `
        <div class="border-b pb-3.5 flex flex-col gap-2">
          <h4 class="font-display font-semibold text-sm text-espresso flex items-start gap-2">
            <span class="text-gold font-bold font-mono">Q${idx + 1}.</span> 
            ${f.q}
          </h4>
          <p class="text-xs sm:text-sm text-ink-2 pl-6 leading-relaxed">${f.a}</p>
        </div>
      `;
    });

    faqsHtml += `
        </div>
      </div>
    `;
  }

  // Estructurar el HTML principal
  const html = `
    <!-- JSON-LD Structured Data Schemas -->
    <script type="application/ld+json">${JSON.stringify(faqsJsonLd)}</script>
    <script type="application/ld+json">${JSON.stringify(breadcrumbJsonLd)}</script>

    <!-- breadcrumb links navigation bar -->
    <nav class="text-[10px] text-ink-2 flex items-center gap-1.5 font-mono uppercase mb-4 tracking-widest">
      <a href="/" class="hover:text-maroon">Inicio</a>
      <span class="text-border">/</span>
      <span class="text-gold font-semibold">${pageData.title}</span>
    </nav>

    <!-- Main Content Container with Sacred Margins -->
    <article class="bg-[#FCFAF7] border rounded-2xl p-6 sm:p-10 shadow-sm flex flex-col gap-6 select-text sacred-border">
      <div class="flex flex-col gap-2 py-2 border-b">
        <h1 class="font-display font-bold text-2xl sm:text-3.5xl text-maroon leading-tight tracking-wide">${pageData.h1}</h1>
        <div class="flex items-center gap-2.5 text-[10px] text-ink-2 font-mono uppercase tracking-wider mt-1">
          <span class="bg-gold-light text-maroon font-bold px-2 py-0.5 rounded font-mono">${pageData.categoria || 'Doctrina'}</span>
          <span>• Actualizado: Junio 2026</span>
          <span>• Revisado por Teología CatólicosGPT</span>
        </div>
      </div>

      <p class="font-serif italic text-base sm:text-lg text-ink-2 leading-relaxed border-l-4 border-gold pl-4 sm:pl-5 my-2">
        "${pageData.intro}"
      </p>

      <div class="markdown-body prose max-w-none text-ink text-xs sm:text-sm leading-relaxed tracking-normal select-text">
        ${mdHtml}
      </div>

      ${faqsHtml}
      ${relatedHtml}
    </article>
  `;

  return { html, seoTitle: pageData.seoTitle, metaDescription: pageData.metaDescription, keywords: pageData.keywords };
}

// Master Route Dynamic Handler
router.get('*', async (req, res, next) => {
  const urlPath = req.path;
  
  // 1. Verificar si coincide con una de nuestras rutas de Pilares SEO estáticas
  const match = CORE_PILLARS_TOPICS[urlPath];
  if (match) {
    // Cargar posts de blog para el sistema de recomendación
    const blogData = blog.loadPosts?.() || { posts: [] };
    const relatedData = {
      saints: getRandomSaintsLinks(),
      questions: getRandomQuestionsLinks(),
      articles: blogData.posts.slice(0, 5)
    };

    // Obtener e-liturgias si es parte de Pilar 1 para un contexto inmediato
    let dynamicTopicName = match.tema;
    
    // Obtener o generar contenido
    const serverInstance = require('./server-utils-dummy-or-real'); // dynamically fetch getAi safely
    const getAiFn = serverInstance.getAi || (() => null);

    const pageData = await getOrGenerateSEOPageContent(getAiFn, dynamicTopicName, urlPath);
    const rendered = renderSEOPage(req, pageData, relatedData);

    const fullPageHtml = global.renderPageWithSSR 
      ? global.renderPageWithSSR(rendered.seoTitle, rendered.html, req, { description: rendered.metaDescription, keywords: rendered.keywords })
      : rendered.html; // Fallback directly managed inside server.js wrapping

    return res.send(fullPageHtml);
  }

  // 2. Verificar si es una oracion individual del tipo /oracion-:slug
  const oracionMatch = urlPath.match(/^\/oracion-([a-z0-9-]+)$/i);
  if (oracionMatch) {
    const slug = oracionMatch[1];
    const cleanName = slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    const dynamicTopicName = `Oración del ${cleanName} Católicamente Explicada`;
    
    const blogData = blog.loadPosts?.() || { posts: [] };
    const relatedData = {
      saints: getRandomSaintsLinks(),
      questions: getRandomQuestionsLinks(),
      articles: blogData.posts.slice(0, 5)
    };

    const serverInstance = require('./server-utils-dummy-or-real');
    const getAiFn = serverInstance.getAi || (() => null);

    const pageData = await getOrGenerateSEOPageContent(getAiFn, dynamicTopicName, urlPath);
    const rendered = renderSEOPage(req, pageData, relatedData);
    
    const fullPageHtml = global.renderPageWithSSR 
      ? global.renderPageWithSSR(rendered.seoTitle, rendered.html, req, { description: rendered.metaDescription, keywords: rendered.keywords })
      : rendered.html;

    return res.send(fullPageHtml);
  }

  // 3. Verificar si es una pregunta individual del tipo /pregunta/:slug o /santos/:slug
  const preguntaMatch = urlPath.match(/^\/pregunta\/([a-z0-9-]+)$/i);
  const santoMatch = urlPath.match(/^\/santos\/([a-z0-9-]+)$/i);
  const explicacionMatch = urlPath.match(/^\/(explicacion|significado|que-significa)-([a-z0-9-]+)$/i);

  if (preguntaMatch || santoMatch || explicacionMatch) {
    let slug = '';
    let category = 'Apologética';
    let labelPrefix = 'Análisis de Pregunta Católicamente Explicada';

    if (preguntaMatch) {
      slug = preguntaMatch[1];
      category = 'Pregunta Catolica';
      labelPrefix = 'Pregunta Central Doctrinal';
    } else if (santoMatch) {
      slug = santoMatch[1];
      category = 'Hagiografia';
      labelPrefix = 'Vida de Fe de';
    } else if (explicacionMatch) {
      slug = explicacionMatch[2];
      category = 'Explicacion Biblica';
      labelPrefix = `Qué significa el pasaje bíblico`;
    }

    const cleanName = slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    const dynamicTopicName = `${labelPrefix} ${cleanName}`;

    const blogData = blog.loadPosts?.() || { posts: [] };
    const relatedData = {
      saints: getRandomSaintsLinks(),
      questions: getRandomQuestionsLinks(),
      articles: blogData.posts.slice(0, 5)
    };

    const serverInstance = require('./server-utils-dummy-or-real');
    const getAiFn = serverInstance.getAi || (() => null);

    const pageData = await getOrGenerateSEOPageContent(getAiFn, dynamicTopicName, urlPath);
    pageData.categoria = category;
    const rendered = renderSEOPage(req, pageData, relatedData);

    const fullPageHtml = global.renderPageWithSSR 
      ? global.renderPageWithSSR(rendered.seoTitle, rendered.html, req, { description: rendered.metaDescription, keywords: rendered.keywords })
      : rendered.html;

    return res.send(fullPageHtml);
  }

  // 4. Si es una ruta bíblica programática /biblia, /biblia/:libro, etc.
  const bibliaMatch = urlPath.match(/^\/biblia(?:\/([a-z0-9-]+))?(?:\/(\d+))?(?:\/(\d+))?$/i);
  if (bibliaMatch) {
    const libroSlug = bibliaMatch[1];
    const capituloInput = bibliaMatch[2];
    const versiculoInput = bibliaMatch[3];

    let dynamicTopicName = "Sagrada Biblia Católica de Navarra: Lecturas y Estudio completo";
    let subCategory = "Biblia";

    if (libroSlug) {
      const actualLibro = bibliaModule.buscarLibro?.(libroSlug) || libroSlug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      dynamicTopicName = `Libro de ${actualLibro} completo y comentarios doctrinales`;
      
      if (capituloInput) {
        dynamicTopicName = `Capítulo ${capituloInput} del libro de ${actualLibro}`;
        if (versiculoInput) {
          dynamicTopicName = `Versículo ${versiculoInput} del capítulo ${capituloInput} de ${actualLibro}`;
        }
      }
    }

    const blogData = blog.loadPosts?.() || { posts: [] };
    const relatedData = {
      saints: getRandomSaintsLinks(),
      questions: getRandomQuestionsLinks(),
      articles: blogData.posts.slice(0, 5)
    };

    const serverInstance = require('./server-utils-dummy-or-real');
    const getAiFn = serverInstance.getAi || (() => null);

    const pageData = await getOrGenerateSEOPageContent(getAiFn, dynamicTopicName, urlPath);
    pageData.categoria = subCategory;
    const rendered = renderSEOPage(req, pageData, relatedData);

    const fullPageHtml = global.renderPageWithSSR 
      ? global.renderPageWithSSR(rendered.seoTitle, rendered.html, req, { description: rendered.metaDescription, keywords: rendered.keywords })
      : rendered.html;

    return res.send(fullPageHtml);
  }

  // No coincide con ninguna ruta programática, pasar al siguiente router / 404
  next();
});

module.exports = router;
