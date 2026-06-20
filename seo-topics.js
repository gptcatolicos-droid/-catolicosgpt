// ════════════════════════════════════════════════════════════════
// SEO TOPICS — Sementeras semánticas para SEO masivo
// Datos de las 200 temáticas y palabras clave católicas
// ════════════════════════════════════════════════════════════════

const TEMAS_SEO = [
  {
    tema: "Aborto doctrina católica",
    slug: "aborto-doctrina-catolica",
    categoria: "moral",
    keywords: "aborto pecado, que dice el catecismo del aborto, excomunion latae sententiae, misericordia iglesia proyecto raquel",
    h1: "El aborto en la Doctrina Católica: Defensa Sagrada de la Vida",
    intro: "La Iglesia defiende que la vida humana comienza en el momento de la concepción y debe ser amparada.",
    contenido: "El aborto directo... es siempre un desorden moral grave según el Catecismo de la Iglesia Católica y la encíclica Evangelium Vitae.",
    fuentes: "Catecismo N° 2270-2275, Evangelium Vitae"
  },
  {
    tema: "Eutanasia que dice el catecismo",
    slug: "eutanasia-que-dice-el-catecismo",
    categoria: "moral",
    keywords: "eutanasia pecado catolico, rechazo encarnizamiento terapeutico, sedacion paliativa catolicismo",
    h1: "¿Qué dice el Catecismo de la Iglesia Católica sobre la Eutanasia?",
    intro: "La vida humana es un don sagrado que le pertenece a Dios. Por tanto, la eutanasia es moralmente inadmisible.",
    contenido: "Cualesquiera que sean los motivos, la eutanasia directa consiste en poner fin a la vida de personas enfermas.",
    fuentes: "Catecismo N° 2276-2279, Samaritanus Bonus"
  },
  {
    tema: "Homosexualidad y catecismo",
    slug: "homosexualidad-y-catecismo",
    categoria: "moral",
    keywords: "iglesia catolica homosexualidad, castidad inclinacion, fiducia supplicans bendicion",
    h1: "Homosexualidad y el Catecismo: Acogida, Doctrina y Pastoral",
    intro: "Descubre la doctrina de la Iglesia respecto a la inclinación homosexual y su llamado a la castidad.",
    contenido: "El Catecismo enseña que las personas con tendencias homosexuales deben ser acogidas con respeto, compasión y delicadeza.",
    fuentes: "Catecismo N° 2357-2359, Fiducia Supplicans 2023"
  },
  {
    tema: "Divorcio y comunión católicos",
    slug: "divorcio-y-comunion-catolicos",
    categoria: "moral",
    keywords: "divorciados vueltos a casar, comulgar divorciado, nulidad eclesiastica, amoris laetitia pastoral",
    h1: "Divorcio, Segundas Nupcias y Comunión en la Iglesia",
    intro: "La indisolubilidad del matrimonio sacramental y el acompañamiento pastoral a divorciados en nueva unión.",
    contenido: "La Iglesia reafirma la indisolubilidad del matrimonio válido. Aquellos divorciados vueltos a casar civilmente se encuentran en situación irregular.",
    fuentes: "Familiaris Consortio, Amoris Laetitia"
  },
  {
    tema: "Peligros del transhumanismo y ética cristiana",
    slug: "peligros-del-transhumanismo-y-etica-cristiana",
    categoria: "doctrina",
    keywords: "transhumanismo iglesia catolica, deidades de silicio, magnifica humanitas papa leon xiv, etica de la ia",
    h1: "Peligros del Transhumanismo bajo la Ética Cristiana",
    intro: "Un análisis de la ideología transhumanista y sus amenazas contra el ser humano según la teología católica.",
    contenido: "El transhumanismo busca superar los límites biológicos del ser humano mediante la biotecnología y la inteligencia artificial.",
    fuentes: "Encíclica Magnifica Humanitas de León XIV, Dignitas Personae"
  }
];

function getTemasSEO() { return TEMAS_SEO; }
function getTemaSEBySlug(slug) { return TEMAS_SEO.find(t => t.slug === slug) || null; }

module.exports = { getTemasSEO, getTemaSEBySlug };
