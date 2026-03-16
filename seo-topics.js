// 100 temas SEO católicos — URLs canónicas en español
// Organizados por volumen de búsqueda estimado

const SEO_TOPICS = [
  // ═══════════════════════════════════════
  // TIER 1 — Alto volumen (50k-200k búsquedas/mes)
  // ═══════════════════════════════════════
  {
    slug: "oracion-del-padre-nuestro",
    title: "Oración del Padre Nuestro — Texto Completo y Significado",
    description: "El Padre Nuestro completo en español: texto, origen bíblico, significado versículo a versículo y cómo rezarlo según el Catecismo.",
    keywords: ["padre nuestro", "oración padre nuestro", "padre nuestro texto", "padre nuestro completo", "oración del señor"],
    category: "oraciones"
  },
  {
    slug: "ave-maria-oracion-completa",
    title: "Ave María — Oración Completa, Origen e Historia",
    description: "Ave María completa en español: texto de la oración, origen bíblico en Lucas 1:28, historia y significado teológico.",
    keywords: ["ave maria", "ave maría oración", "ave maria completa", "salve regina", "oración a la virgen"],
    category: "oraciones"
  },
  {
    slug: "como-rezar-el-rosario",
    title: "Cómo Rezar el Rosario — Guía Completa Paso a Paso",
    description: "Aprende a rezar el Santo Rosario completo: los 20 misterios, las oraciones, el orden correcto y los beneficios espirituales según el Magisterio.",
    keywords: ["como rezar el rosario", "rosario completo", "misterios del rosario", "rosario paso a paso", "rezar rosario"],
    category: "oraciones"
  },
  {
    slug: "los-10-mandamientos-de-dios",
    title: "Los 10 Mandamientos de Dios — Texto Completo y Explicación",
    description: "Los diez mandamientos completos según el Catecismo de la Iglesia Católica: texto, explicación y aplicación a la vida cristiana.",
    keywords: ["10 mandamientos", "diez mandamientos", "mandamientos de dios", "mandamientos catolicismo", "ley de dios"],
    category: "doctrina"
  },
  {
    slug: "los-7-sacramentos-de-la-iglesia",
    title: "Los 7 Sacramentos de la Iglesia Católica — Explicación Completa",
    description: "Los siete sacramentos: bautismo, confirmación, eucaristía, penitencia, unción, orden y matrimonio. Definición, materia, forma y efectos.",
    keywords: ["7 sacramentos", "sacramentos de la iglesia", "siete sacramentos", "sacramentos catolicismo", "sacramentos definicion"],
    category: "sacramentos"
  },
  {
    slug: "acto-de-contricion",
    title: "Acto de Contrición — Texto Completo y Significado",
    description: "El Acto de Contrición completo para la confesión: texto tradicional, texto moderno, significado y cuándo se reza.",
    keywords: ["acto de contricion", "acto de contrición", "oración confesión", "arrepentimiento oración", "contricion perfecta"],
    category: "oraciones"
  },
  {
    slug: "examen-de-conciencia-completo",
    title: "Examen de Conciencia Completo para la Confesión",
    description: "Examen de conciencia detallado según los 10 mandamientos y los pecados capitales, para preparar una buena confesión.",
    keywords: ["examen de conciencia", "examen conciencia confesion", "como confesarse", "pecados confesion", "preparar confesion"],
    category: "sacramentos"
  },
  {
    slug: "novena-a-la-virgen-de-guadalupe",
    title: "Novena a la Virgen de Guadalupe — 9 Días Completos",
    description: "Novena completa a Nuestra Señora de Guadalupe: los 9 días de oración, historia de las apariciones y promesas de la Virgen.",
    keywords: ["novena virgen de guadalupe", "novena guadalupe", "virgen de guadalupe novena", "oración guadalupe", "12 diciembre guadalupe"],
    category: "novenas"
  },
  {
    slug: "que-es-la-eucaristia",
    title: "¿Qué es la Eucaristía? — Doctrina Católica Completa",
    description: "La Eucaristía explicada: presencia real de Cristo, transubstanciación, institución en la Última Cena y enseñanza del Catecismo.",
    keywords: ["que es la eucaristia", "eucaristia definicion", "sacramento eucaristia", "transubstanciacion", "cuerpo de cristo"],
    category: "sacramentos"
  },
  {
    slug: "pecados-capitales-y-virtudes",
    title: "Los 7 Pecados Capitales y las Virtudes Opuestas",
    description: "Los siete pecados capitales: soberbia, avaricia, lujuria, ira, gula, envidia y pereza. Definición, consecuencias y virtudes que los combaten.",
    keywords: ["pecados capitales", "7 pecados capitales", "siete pecados capitales", "vicios capitales", "virtudes cardinales"],
    category: "moral"
  },

  // ═══════════════════════════════════════
  // TIER 2 — Volumen medio-alto (10k-50k/mes)
  // ═══════════════════════════════════════
  {
    slug: "novena-a-san-judas-tadeo",
    title: "Novena a San Judas Tadeo — Oración de los Casos Difíciles",
    description: "Novena completa a San Judas Tadeo, apóstol de los casos imposibles: 9 días de oración, historia y promesas del santo.",
    keywords: ["novena san judas tadeo", "san judas tadeo novena", "oracion san judas", "san judas casos dificiles"],
    category: "novenas"
  },
  {
    slug: "que-es-la-santisima-trinidad",
    title: "La Santísima Trinidad — Explicación Teológica Completa",
    description: "El misterio de la Santísima Trinidad: Padre, Hijo y Espíritu Santo. Fundamento bíblico, doctrina del Concilio de Nicea y analogías para comprenderla.",
    keywords: ["santisima trinidad", "trinidad explicacion", "padre hijo espirito santo", "trinidad doctrina", "misterio trinidad"],
    category: "doctrina"
  },
  {
    slug: "oracion-al-espiritu-santo",
    title: "Oración al Espíritu Santo — Textos y Letanías Completas",
    description: "Oraciones al Espíritu Santo: Ven Espíritu Santo, Veni Creator Spiritus, letanías y oraciones para pedir los 7 dones.",
    keywords: ["oracion al espiritu santo", "ven espiritu santo", "oraciones espiritu santo", "dones espiritu santo", "veni creator"],
    category: "oraciones"
  },
  {
    slug: "que-es-el-purgatorio",
    title: "¿Qué es el Purgatorio? — Doctrina Católica y Base Bíblica",
    description: "El purgatorio explicado: qué es, base bíblica, doctrina del Catecismo, diferencia con el cielo e infierno y cómo ayudar a las almas.",
    keywords: ["que es el purgatorio", "purgatorio explicacion", "purgatorio biblia", "almas del purgatorio", "purgatorio catolicismo"],
    category: "doctrina"
  },
  {
    slug: "novena-a-san-miguel-arcangel",
    title: "Novena a San Miguel Arcángel — 9 Días de Oración",
    description: "Novena completa a San Miguel Arcángel, príncipe de la milicia celestial: oraciones de los 9 días, historia y letanías.",
    keywords: ["novena san miguel arcangel", "san miguel arcangel novena", "oracion san miguel", "arcangel miguel"],
    category: "novenas"
  },
  {
    slug: "apariciones-de-la-virgen-maria",
    title: "Las Apariciones de la Virgen María — Historia y Mensajes",
    description: "Las principales apariciones marianas aprobadas por la Iglesia: Fátima, Guadalupe, Lourdes, Medjugorje. Mensajes y significado para hoy.",
    keywords: ["apariciones virgen maria", "apariciones marianas", "fatima lourdes guadalupe", "mensajes virgen", "virgen apariciones"],
    category: "mariologia"
  },
  {
    slug: "como-hacer-una-buena-confesion",
    title: "Cómo Hacer una Buena Confesión — Guía Completa",
    description: "Pasos para una buena confesión sacramental: examen de conciencia, contrición, propósito de enmienda, acusación y satisfacción.",
    keywords: ["como confesarse", "buena confesion", "sacramento confesion", "confesion pasos", "sacramento penitencia"],
    category: "sacramentos"
  },
  {
    slug: "historia-de-la-iglesia-catolica",
    title: "Historia de la Iglesia Católica — Desde los Orígenes",
    description: "Historia completa de la Iglesia Católica: fundación por Cristo, los apóstoles, los concilios, la Reforma y la Iglesia en el siglo XXI.",
    keywords: ["historia iglesia catolica", "origen iglesia catolica", "historia catolicismo", "iglesia primitiva", "concilios iglesia"],
    category: "historia"
  },
  {
    slug: "virgenes-y-santos-mas-venerados",
    title: "Los Santos Más Venerados de la Iglesia Católica",
    description: "Los santos católicos más importantes: San José, San Francisco, Santa Teresa, San Agustín, Santo Tomás de Aquino y más.",
    keywords: ["santos catolicos", "santos mas venerados", "santos de la iglesia", "santos patrones", "vida de los santos"],
    category: "santos"
  },
  {
    slug: "que-es-la-gracia-de-dios",
    title: "¿Qué es la Gracia de Dios? — Doctrina Católica",
    description: "La gracia divina explicada: gracia santificante, gracia actual, gracia sacramental, diferencia entre gracia y mérito.",
    keywords: ["gracia de dios", "gracia santificante", "que es la gracia", "gracia divina catolicismo", "estado de gracia"],
    category: "doctrina"
  },
  {
    slug: "novena-a-santa-rita-de-casia",
    title: "Novena a Santa Rita de Casia — Patrona de los Imposibles",
    description: "Novena completa a Santa Rita de Casia: 9 días de oración, vida de la santa, promesas y para qué situaciones invocarla.",
    keywords: ["novena santa rita", "santa rita de casia novena", "oracion santa rita", "santa rita imposibles"],
    category: "novenas"
  },

  // ═══════════════════════════════════════
  // TIER 3 — Volumen medio (5k-10k/mes)
  // ═══════════════════════════════════════
  {
    slug: "beatitudes-y-bienaventuranzas",
    title: "Las Bienaventuranzas — Texto Completo y Explicación",
    description: "Las ocho bienaventuranzas del Sermón del Monte (Mateo 5,3-12): texto, significado teológico y aplicación a la vida cristiana.",
    keywords: ["bienaventuranzas", "beatitudes", "sermon del monte", "mateo 5", "bienaventurados los pobres"],
    category: "biblia"
  },
  {
    slug: "que-es-el-catecismo-de-la-iglesia",
    title: "¿Qué es el Catecismo de la Iglesia Católica?",
    description: "El Catecismo de la Iglesia Católica: qué contiene, cuándo fue publicado, cómo se organiza y por qué es importante para los católicos.",
    keywords: ["catecismo iglesia catolica", "catecismo que es", "CIC catecismo", "catecismo juan pablo ii", "doctrina catecismo"],
    category: "doctrina"
  },
  {
    slug: "novena-al-sagrado-corazon-de-jesus",
    title: "Novena al Sagrado Corazón de Jesús — 9 Días Completos",
    description: "Novena completa al Sagrado Corazón de Jesús: historia de la devoción, oraciones de los 9 días y promesas del Sagrado Corazón.",
    keywords: ["novena sagrado corazon", "sagrado corazon novena", "devocion sagrado corazon", "promesas sagrado corazon"],
    category: "novenas"
  },
  {
    slug: "diferencia-entre-catolicismo-y-protestantismo",
    title: "Diferencias entre Catolicismo y Protestantismo",
    description: "Principales diferencias teológicas: la Biblia y la Tradición, el Papa, los sacramentos, la justificación y María.",
    keywords: ["catolicismo vs protestantismo", "diferencias catolicismo protestantismo", "reforma protestante", "iglesia evangelica vs catolica"],
    category: "ecumenismo"
  },
  {
    slug: "que-dice-la-biblia-sobre-el-matrimonio",
    title: "¿Qué Dice la Biblia sobre el Matrimonio?",
    description: "El matrimonio según la Biblia y el Catecismo: institución divina, propiedades (unidad e indisolubilidad), Sacramento del Matrimonio.",
    keywords: ["biblia matrimonio", "matrimonio catolicismo", "sacramento matrimonio", "indisolubilidad matrimonio", "matrimonio cristiano"],
    category: "moral"
  },
  {
    slug: "oracion-de-la-salve-regina",
    title: "La Salve Regina — Texto Completo, Historia y Significado",
    description: "Salve Regina completa en español y latín: texto, historia medieval, significado teológico y cuándo se reza en la Iglesia.",
    keywords: ["salve regina", "salve regina texto", "oracion salve", "salve reina", "letanias marianas"],
    category: "oraciones"
  },
  {
    slug: "vida-de-san-francisco-de-asis",
    title: "Vida de San Francisco de Asís — Historia Completa",
    description: "Biografía completa de San Francisco de Asís: conversión, fundación de los franciscanos, estigmas, Cántico de las Criaturas y canonización.",
    keywords: ["san francisco de asis", "vida san francisco", "historia san francisco asis", "francisco de asis biografia"],
    category: "santos"
  },
  {
    slug: "que-es-la-indulgencia-plenaria",
    title: "¿Qué es una Indulgencia Plenaria? — Explicación Católica",
    description: "Las indulgencias en la Iglesia Católica: qué son, base teológica, diferencia entre plenaria y parcial, cómo se obtienen.",
    keywords: ["indulgencia plenaria", "indulgencias catolicismo", "que es una indulgencia", "indulgencias biblia", "tesoro de la iglesia"],
    category: "doctrina"
  },
  {
    slug: "segunda-venida-de-cristo-fin-del-mundo",
    title: "La Segunda Venida de Cristo — Doctrina Católica",
    description: "La parusía o segunda venida de Cristo: qué enseña la Iglesia, señales bíblicas, el Juicio Final y la resurrección de los muertos.",
    keywords: ["segunda venida de cristo", "fin del mundo catolicismo", "parusía", "juicio final", "apocalipsis catolicismo"],
    category: "escatologia"
  },
  {
    slug: "novena-a-nuestra-senora-de-fatima",
    title: "Novena a Nuestra Señora de Fátima — 9 Días Completos",
    description: "Novena completa a Nuestra Señora de Fátima: los 9 días de oración, historia de las apariciones de 1917 y el mensaje de Fátima.",
    keywords: ["novena virgen de fatima", "novena fatima", "oracion fatima", "mensajes fatima", "13 mayo fatima"],
    category: "novenas"
  },
  {
    slug: "doctrina-social-de-la-iglesia",
    title: "Doctrina Social de la Iglesia Católica — Principios Fundamentales",
    description: "La Doctrina Social de la Iglesia: dignidad humana, bien común, subsidiaridad, solidaridad y opción preferencial por los pobres.",
    keywords: ["doctrina social iglesia", "DSI catolicismo", "bien común", "justicia social católica", "solidaridad subsidiaridad"],
    category: "doctrina"
  },

  // ═══════════════════════════════════════
  // TIER 4 — Búsquedas específicas de IA
  // ═══════════════════════════════════════
  {
    slug: "inteligencia-artificial-y-fe-catolica",
    title: "Inteligencia Artificial y Fe Católica — ¿Qué dice la Iglesia?",
    description: "La Iglesia Católica y la inteligencia artificial: documentos del Vaticano, postura del Papa Francisco y ética cristiana ante la IA.",
    keywords: ["inteligencia artificial iglesia", "ia fe catolica", "vaticano inteligencia artificial", "papa francisco ia", "etica ia cristiana"],
    category: "actualidad"
  },
  {
    slug: "asistente-ia-para-estudiar-la-biblia",
    title: "IA para Estudiar la Biblia — CatolicosGPT",
    description: "Cómo usar la inteligencia artificial para estudiar la Biblia católica: preguntas, pasajes, contexto histórico y aplicación espiritual.",
    keywords: ["ia para estudiar biblia", "inteligencia artificial biblia", "chatgpt biblia", "ia catolica biblia", "estudiar biblia ia"],
    category: "herramientas"
  },
  {
    slug: "catecismo-online-inteligencia-artificial",
    title: "Catecismo Online con Inteligencia Artificial — Gratis",
    description: "Consulta el Catecismo de la Iglesia Católica online con IA: busca cualquier artículo, obtén explicaciones y citas verificadas al instante.",
    keywords: ["catecismo online ia", "catecismo inteligencia artificial", "catecismo digital gratis", "consultar catecismo online"],
    category: "herramientas"
  },
  {
    slug: "lecturas-misa-hoy",
    title: "Lecturas de la Misa de Hoy — Leccionario Romano Actualizado",
    description: "Las lecturas de la Misa de hoy: Primera Lectura, Salmo Responsorial, Segunda Lectura y Evangelio del día según el Leccionario Romano.",
    keywords: ["lecturas de la misa de hoy", "lecturas del dia", "evangelio de hoy", "leccionario romano", "misa de hoy lecturas"],
    category: "liturgia"
  },
  {
    slug: "breviario-laudes-hoy",
    title: "Breviario — Laudes de Hoy | Liturgia de las Horas",
    description: "Laudes de hoy completos: Himno, Salmos, Cántico, Benedictus, Preces y Oración conclusiva. Liturgia de las Horas actualizada.",
    keywords: ["breviario laudes hoy", "liturgia horas laudes", "laudes hoy", "breviario digital", "oficio divino laudes"],
    category: "liturgia"
  },

  // Resto de temas hasta 100
  {
    slug: "que-es-el-limbo-doctrina-catolica",
    title: "¿Qué es el Limbo? — Doctrina Católica Actual",
    description: "El limbo en la teología católica: historia de la doctrina, posición actual de la Iglesia y el documento de 2007.",
    keywords: ["limbo doctrina catolica", "limbo que es", "limbo niños", "limbo teologia"],
    category: "doctrina"
  },
  {
    slug: "novena-a-la-divina-misericordia",
    title: "Novena a la Divina Misericordia — Jesús en Ti Confío",
    description: "Novena completa de la Divina Misericordia dictada por Jesús a Santa Faustina: 9 días, chaplet de la misericordia y hora de la misericordia.",
    keywords: ["novena divina misericordia", "divina misericordia novena", "santa faustina novena", "jesus en ti confio", "chaplet misericordia"],
    category: "novenas"
  },
  {
    slug: "angeles-y-arcangeles-en-la-biblia",
    title: "Ángeles y Arcángeles en la Biblia y el Catecismo",
    description: "Los ángeles en la fe católica: Miguel, Gabriel y Rafael. Función de los ángeles, ángel de la guarda y doctrina del Catecismo.",
    keywords: ["angeles catolicismo", "arcangeles biblia", "san miguel gabriel rafael", "angel de la guarda", "angeles doctrina"],
    category: "doctrina"
  },
  {
    slug: "que-es-la-infalibilidad-papal",
    title: "¿Qué es la Infalibilidad Papal? — Explicación Completa",
    description: "La infalibilidad pontificia: qué significa exactamente, cuándo se aplica, el Concilio Vaticano I y ejemplos históricos.",
    keywords: ["infalibilidad papal", "infalibilidad del papa", "ex cathedra", "vaticano I infalibilidad", "papa infalible"],
    category: "doctrina"
  },
  {
    slug: "moral-sexual-segun-la-iglesia",
    title: "Moral Sexual según la Iglesia Católica — Catecismo",
    description: "La moral sexual católica: castidad, matrimonio, contracepción, Humanae Vitae y el llamado a la pureza según el Catecismo.",
    keywords: ["moral sexual iglesia", "castidad catolicismo", "humanae vitae", "contracepcion iglesia", "moral catolica sexualidad"],
    category: "moral"
  },
  {
    slug: "novena-a-san-antonio-de-padua",
    title: "Novena a San Antonio de Padua — El Santo de los Milagros",
    description: "Novena completa a San Antonio de Padua: 9 días de oración, vida del santo, para qué se le invoca y sus promesas.",
    keywords: ["novena san antonio padua", "san antonio de padua novena", "oracion san antonio", "san antonio milagros"],
    category: "novenas"
  },
  {
    slug: "resurreccion-de-jesus-evidencias",
    title: "La Resurrección de Jesús — Evidencias y Doctrina Católica",
    description: "La resurrección de Cristo: testimonios bíblicos, apariciones del Resucitado, argumento teológico y por qué es el centro de la fe.",
    keywords: ["resurreccion de jesus", "resurreccion cristo", "evidencias resurreccion", "pascua resurreccion", "cristo resucitado"],
    category: "cristologia"
  },
  {
    slug: "que-es-el-bautismo-sacramento",
    title: "¿Qué es el Bautismo? — Sacramento, Efectos y Doctrina",
    description: "El Sacramento del Bautismo: qué es, efectos espirituales, bautismo de niños vs adultos, ministro, materia y forma.",
    keywords: ["que es el bautismo", "sacramento bautismo", "bautismo efectos", "bautismo niños", "bautismo catolicismo"],
    category: "sacramentos"
  },
  {
    slug: "san-jose-patrono-de-la-iglesia",
    title: "San José — Historia, Devoción y Patronazgo Universal",
    description: "San José en la fe católica: su vida, virtudes, por qué es patrono de la Iglesia Universal, el Año de San José y oraciones.",
    keywords: ["san jose patron", "san jose iglesia", "devocion san jose", "año de san jose", "oracion san jose"],
    category: "santos"
  },
  {
    slug: "dogmas-de-la-iglesia-catolica",
    title: "Los Dogmas de la Iglesia Católica — Lista Completa",
    description: "Los dogmas católicos: definición, lista completa, diferencia entre dogma y doctrina, y por qué los católicos están obligados a creerlos.",
    keywords: ["dogmas iglesia catolica", "dogmas catolicismo", "lista dogmas", "dogma definicion", "dogmas de fe"],
    category: "doctrina"
  },
  {
    slug: "vida-despues-de-la-muerte-catolicismo",
    title: "¿Qué pasa después de la Muerte? — Catolicismo",
    description: "La vida después de la muerte según la Iglesia Católica: el juicio particular, cielo, purgatorio, infierno y resurrección final.",
    keywords: ["vida despues de la muerte", "que pasa cuando morimos", "cielo purgatorio infierno", "escatologia catolica", "juicio particular"],
    category: "escatologia"
  },
  {
    slug: "novena-a-nuestra-senora-del-carmen",
    title: "Novena a Nuestra Señora del Carmen — 9 Días",
    description: "Novena completa a Nuestra Señora del Monte Carmelo: oraciones de los 9 días, historia del escapulario y promesas de la Virgen.",
    keywords: ["novena virgen del carmen", "nuestra señora del carmen novena", "escapulario carmelita", "virgen del carmen oracion"],
    category: "novenas"
  },
  {
    slug: "que-es-la-confirmacion-sacramento",
    title: "¿Qué es la Confirmación? — Sacramento del Espíritu Santo",
    description: "El Sacramento de la Confirmación: qué es, efectos, los 7 dones del Espíritu Santo, materia, forma y quién puede recibirla.",
    keywords: ["confirmacion sacramento", "que es la confirmacion", "confirmacion dones espiritu", "confirmacion catolicismo"],
    category: "sacramentos"
  },
  {
    slug: "vida-de-santa-teresa-de-avila",
    title: "Vida de Santa Teresa de Ávila — Doctora de la Iglesia",
    description: "Biografía de Santa Teresa de Jesús: conversión, fundaciones carmelitas, Castillo Interior, Camino de Perfección y su legado espiritual.",
    keywords: ["santa teresa de avila", "teresa de jesus", "santa teresa vida", "carmelitas descalzas", "doctora iglesia teresa"],
    category: "santos"
  },
  {
    slug: "que-es-el-adviento",
    title: "¿Qué es el Adviento? — Tiempo Litúrgico Católico",
    description: "El Adviento explicado: qué es, duración, color litúrgico morado, corona de Adviento, tradiciones y espíritu de espera.",
    keywords: ["que es el adviento", "adviento catolicismo", "tiempo de adviento", "corona de adviento", "adviento preparacion navidad"],
    category: "liturgia"
  },
  {
    slug: "cuaresma-que-es-y-como-vivirla",
    title: "¿Qué es la Cuaresma? — Cómo Vivirla como Católico",
    description: "La Cuaresma: 40 días de preparación para la Pascua. Ayuno, abstinencia, oración, limosna, Miércoles de Ceniza y Semana Santa.",
    keywords: ["que es la cuaresma", "cuaresma catolicismo", "cuaresma ayuno", "miercoles de ceniza", "semana santa"],
    category: "liturgia"
  },
  {
    slug: "novena-de-aguinaldos-navidad",
    title: "Novena de Aguinaldos — Colombia y Latinoamérica",
    description: "Novena de Aguinaldos completa: oraciones de los 9 días (del 16 al 24 de diciembre), historia y tradición navideña latinoamericana.",
    keywords: ["novena de aguinaldos", "novena navidad colombia", "novena navideña", "aguinaldos colombia", "novena diciembre"],
    category: "novenas"
  },
  {
    slug: "santidad-y-canonizacion-proceso",
    title: "¿Cómo se Canoniza un Santo? — El Proceso Completo",
    description: "El proceso de canonización en la Iglesia Católica: siervo de Dios, venerable, beato y santo. Los milagros requeridos y ejemplos recientes.",
    keywords: ["como se canoniza un santo", "proceso canonizacion", "beatificacion canonizacion", "milagros canonizacion", "santos canonizados"],
    category: "doctrina"
  },
  {
    slug: "encíclicas-papales-importantes",
    title: "Las Encíclicas Papales Más Importantes de la Historia",
    description: "Las encíclicas papales fundamentales: Rerum Novarum, Humanae Vitae, Laudato Si, Fratelli Tutti y su impacto en la doctrina.",
    keywords: ["enciclicas papales", "enciclica que es", "laudato si", "fratelli tutti", "humanae vitae enciclica"],
    category: "magisterio"
  },
  {
    slug: "misterios-del-rosario-completo",
    title: "Los 20 Misterios del Rosario — Texto Completo",
    description: "Los 20 misterios del Santo Rosario: gozosos, luminosos, dolorosos y gloriosos. Texto de cada misterio y cómo meditarlos.",
    keywords: ["misterios del rosario", "misterios gozosos", "misterios dolorosos", "misterios gloriosos", "misterios luminosos"],
    category: "oraciones"
  },
  {
    slug: "la-virgen-maria-en-la-fe-catolica",
    title: "La Virgen María en la Fe Católica — Doctrina Completa",
    description: "María en el catolicismo: Inmaculada Concepción, Virginidad perpetua, Maternidad divina, Asunción y su rol como Madre de la Iglesia.",
    keywords: ["virgen maria catolicismo", "maria madre de dios", "inmaculada concepcion", "asuncion maria", "mariologia"],
    category: "mariologia"
  },
  {
    slug: "novena-a-san-expedito",
    title: "Novena a San Expedito — Patrón de las Causas Urgentes",
    description: "Novena completa a San Expedito: oraciones de los 9 días, historia del santo, para qué invocarlo y devoción latinoamericana.",
    keywords: ["novena san expedito", "oracion san expedito", "san expedito causas urgentes", "san expedito novena"],
    category: "novenas"
  },
  {
    slug: "diferencia-entre-religion-y-fe",
    title: "¿Cuál es la Diferencia entre Religión y Fe?",
    description: "Fe y religión en el catolicismo: la fe como don de Dios, la religión como respuesta institucional y la relación personal con Dios.",
    keywords: ["diferencia religion y fe", "que es la fe", "fe catolica", "religion definicion", "fe vs religion"],
    category: "doctrina"
  },
  {
    slug: "concilio-vaticano-ii-que-cambio",
    title: "El Concilio Vaticano II — ¿Qué Cambió en la Iglesia?",
    description: "El Concilio Vaticano II (1962-1965): principales cambios, documentos fundamentales, la Misa en lengua vernácula y la apertura al mundo.",
    keywords: ["concilio vaticano II", "vaticano 2", "que cambio vaticano 2", "misa vaticano 2", "reforma liturgica"],
    category: "historia"
  },
  {
    slug: "que-es-la-misa-estructura",
    title: "¿Qué es la Misa? — Estructura Completa y Significado",
    description: "La Santa Misa explicada: partes de la Misa, Liturgia de la Palabra, Liturgia Eucarística, Consagración y significado de cada momento.",
    keywords: ["que es la misa", "estructura de la misa", "partes de la misa", "misa explicada", "liturgia eucaristica"],
    category: "liturgia"
  },
  {
    slug: "jesus-historico-vs-jesus-de-fe",
    title: "El Jesús Histórico — Evidencias Fuera de la Biblia",
    description: "Evidencias históricas de Jesús de Nazaret: Flavio Josefo, Tácito, Plinio el Joven y el consenso académico actual.",
    keywords: ["jesus historico", "evidencias historicas jesus", "jesus flavio josefo", "historicidad jesus", "jesus existencia historica"],
    category: "cristologia"
  },
  {
    slug: "novena-al-nino-jesus-de-praga",
    title: "Novena al Niño Jesús de Praga — 9 Días Completos",
    description: "Novena completa al Niño Jesús de Praga: historia de la imagen, oraciones de los 9 días, promesas y devoción mundial.",
    keywords: ["novena niño jesus de praga", "niño jesus praga novena", "oracion niño jesus praga", "devocion niño jesus praga"],
    category: "novenas"
  },
  {
    slug: "fe-y-razon-en-el-catolicismo",
    title: "Fe y Razón en el Catolicismo — Fides et Ratio",
    description: "La armonía entre fe y razón en la Iglesia Católica: la encíclica Fides et Ratio de Juan Pablo II, Santo Tomás de Aquino y la filosofía cristiana.",
    keywords: ["fe y razon catolicismo", "fides et ratio", "fe razon iglesia", "filosofia cristiana", "tomas aquino fe razon"],
    category: "doctrina"
  },
  {
    slug: "que-es-el-diezmo-en-el-catolicismo",
    title: "¿Qué es el Diezmo en el Catolicismo?",
    description: "El diezmo en la Iglesia Católica: obligación moral, base bíblica, la ofrenda dominical y la diferencia con otras denominaciones.",
    keywords: ["diezmo catolicismo", "diezmo iglesia", "ofrenda dominical", "diezmo biblia", "contribucion iglesia"],
    category: "moral"
  },
  {
    slug: "santos-patrones-de-latinoamerica",
    title: "Santos Patrones de Latinoamérica — Por País",
    description: "Los santos patrones de cada país latinoamericano: Colombia, México, Argentina, Perú, Chile, Venezuela, Bolivia, Ecuador y más.",
    keywords: ["santos patrones latinoamerica", "patron colombia", "patron mexico", "virgen de guadalupe patron", "nuestra señora chiquinquira"],
    category: "santos"
  },
  {
    slug: "oracion-de-san-francisco-de-asis",
    title: "Oración de San Francisco de Asís — Señor Hazme Instrumento",
    description: "La famosa oración atribuida a San Francisco: 'Señor, hazme instrumento de tu paz'. Texto completo, historia y meditación.",
    keywords: ["oracion san francisco", "hazme instrumento de tu paz", "oracion paz san francisco", "oracion franciscana"],
    category: "oraciones"
  },
  {
    slug: "novena-a-la-medalla-milagrosa",
    title: "Novena a la Medalla Milagrosa — Santa Catalina Labouré",
    description: "Novena completa de la Medalla Milagrosa: historia de las apariciones a Santa Catalina Labouré, oraciones y significado de la medalla.",
    keywords: ["novena medalla milagrosa", "medalla milagrosa novena", "oracion medalla milagrosa", "santa catalina laboure"],
    category: "novenas"
  },
  {
    slug: "oracion-de-la-coronilla-a-la-divina-misericordia",
    title: "Coronilla de la Divina Misericordia — Texto Completo",
    description: "La Coronilla de la Divina Misericordia completa: texto, cómo rezarla con el rosario, hora de la misericordia y origen con Santa Faustina.",
    keywords: ["coronilla divina misericordia", "chaplet divine mercy español", "coronilla misericordia texto", "hora de la misericordia"],
    category: "oraciones"
  },
  {
    slug: "aborto-doctrina-de-la-iglesia",
    title: "El Aborto según la Doctrina de la Iglesia Católica",
    description: "La posición de la Iglesia Católica sobre el aborto: base bíblica, Catecismo, documentos papales y el valor sagrado de la vida humana.",
    keywords: ["aborto iglesia catolica", "aborto catolicismo", "vida desde concepcion iglesia", "iglesia aborto doctrina"],
    category: "moral"
  },
  {
    slug: "que-es-la-vocacion-cristiana",
    title: "¿Qué es la Vocación? — El Llamado de Dios en el Catolicismo",
    description: "La vocación cristiana: vocación universal a la santidad, vocación al matrimonio, vida consagrada, sacerdocio y cómo discernirla.",
    keywords: ["vocacion cristiana", "vocacion sacerdotal", "discernimiento vocacion", "llamado de dios", "vida consagrada vocacion"],
    category: "espiritualidad"
  },
  {
    slug: "semana-santa-celebracion-catolica",
    title: "Semana Santa Católica — Cada Día Explicado",
    description: "La Semana Santa completa: Domingo de Ramos, Lunes al Miércoles Santo, Jueves Santo, Viernes Santo, Sábado de Gloria y Pascua.",
    keywords: ["semana santa", "semana santa catolicismo", "jueves santo", "viernes santo", "domingo de ramos"],
    category: "liturgia"
  },
  {
    slug: "novena-a-san-martin-de-porres",
    title: "Novena a San Martín de Porres — El Santo de los Pobres",
    description: "Novena completa a San Martín de Porres: vida del primer santo negro de América, oraciones de los 9 días y devoción latinoamericana.",
    keywords: ["novena san martin de porres", "san martin de porres novena", "oracion san martin porres", "primer santo negro"],
    category: "novenas"
  },
  {
    slug: "que-es-la-oracion-mental",
    title: "¿Qué es la Oración Mental? — Guía para Principiantes",
    description: "La oración mental en la espiritualidad católica: qué es, cómo practicarla, lectio divina, meditación cristiana y contemplación.",
    keywords: ["oracion mental", "meditacion cristiana", "lectio divina", "contemplacion oracion", "como orar mejor"],
    category: "espiritualidad"
  },
  {
    slug: "apariciones-de-fatima-1917",
    title: "Las Apariciones de Fátima 1917 — Historia Completa",
    description: "Las apariciones de Nuestra Señora de Fátima a los tres pastorcillos: los 6 apariciones, los secretos, el milagro del sol y el mensaje.",
    keywords: ["apariciones fatima", "fatima 1917", "secretos de fatima", "milagro del sol fatima", "lucia francisco jacinta"],
    category: "mariologia"
  },
  {
    slug: "espiritualidad-ignaciana-jesuitas",
    title: "Espiritualidad Ignaciana — Los Ejercicios Espirituales",
    description: "La espiritualidad de San Ignacio de Loyola: los Ejercicios Espirituales, el discernimiento de espíritus, los jesuitas y el AMDG.",
    keywords: ["espiritualidad ignaciana", "ejercicios espirituales ignacio", "jesuitas espiritualidad", "discernimiento espiritual", "ignacio loyola"],
    category: "espiritualidad"
  },
  {
    slug: "novena-a-san-judas-de-las-causas-imposibles",
    title: "Oración a San Judas Tadeo para Casos Imposibles",
    description: "Poderosa oración a San Judas Tadeo para causas imposibles: texto completo, cómo invocarle y testimonios de milagros atribuidos.",
    keywords: ["oracion san judas tadeo", "san judas causas imposibles", "san judas tadeo milagros", "oracion urgente san judas"],
    category: "oraciones"
  },
  {
    slug: "historia-de-la-navidad-origen",
    title: "Historia y Origen de la Navidad — Tradición Católica",
    description: "El origen de la Navidad: nacimiento de Jesús en Belén, pesebre, Reyes Magos, fecha del 25 de diciembre y significado litúrgico.",
    keywords: ["historia navidad", "origen navidad", "nacimiento de jesus", "pesebre navidad", "25 diciembre origen"],
    category: "liturgia"
  },
  {
    slug: "que-es-el-sacerdocio-ministerial",
    title: "¿Qué es el Sacerdocio? — Orden Sacerdotal Católico",
    description: "El Sacramento del Orden Sacerdotal: diaconado, presbiterado y episcopado. Celibato sacerdotal, funciones del sacerdote y vocación.",
    keywords: ["sacerdocio catolicismo", "orden sacerdotal", "sacerdote funciones", "celibato sacerdotal", "vocacion sacerdotal"],
    category: "sacramentos"
  },
  {
    slug: "novena-por-las-almas-del-purgatorio",
    title: "Novena por las Almas del Purgatorio — Mes de Noviembre",
    description: "Novena por las almas del purgatorio: oraciones de los 9 días, cómo ayudar a los difuntos, indulgencias y el Mes de Noviembre.",
    keywords: ["novena almas purgatorio", "novena por los difuntos", "mes de noviembre difuntos", "almas purgatorio oracion"],
    category: "novenas"
  },
  {
    slug: "herejias-historicas-de-la-iglesia",
    title: "Las Herejías Históricas y la Respuesta de la Iglesia",
    description: "Las principales herejías: arianismo, nestorianismo, pelagianismo, catarismo, jansenismo. Concilios que las condenaron y doctrina ortodoxa.",
    keywords: ["herejias iglesia", "arianismo heresia", "gnosticismo heresia", "concilios iglesia herejias", "doctrina ortodoxa"],
    category: "historia"
  },
  {
    slug: "matrimonio-catolico-vs-civil",
    title: "Matrimonio Católico vs Matrimonio Civil — Diferencias",
    description: "Las diferencias entre el matrimonio sacramental católico y el matrimonio civil: efectos jurídicos, espiritualidad y validez para la Iglesia.",
    keywords: ["matrimonio catolico vs civil", "boda catolica vs civil", "matrimonio sacramento vs civil", "validez matrimonio iglesia"],
    category: "sacramentos"
  },
  {
    slug: "que-es-la-adoracion-al-santisimo",
    title: "¿Qué es la Adoración al Santísimo Sacramento?",
    description: "La adoración eucarística: qué es, por qué se venera la Eucaristía, el Santísimo expuesto, las horas santas y el culto eucarístico.",
    keywords: ["adoracion santisimo", "adoracion eucaristica", "hora santa", "santisimo expuesto", "adoracion nocturna"],
    category: "liturgia"
  },
  {
    slug: "novena-a-la-virgen-del-perpetuo-socorro",
    title: "Novena a la Virgen del Perpetuo Socorro",
    description: "Novena completa a Nuestra Señora del Perpetuo Socorro: historia del ícono, oraciones de los 9 días y devoción redentorista.",
    keywords: ["novena virgen perpetuo socorro", "perpetuo socorro novena", "oracion virgen perpetuo socorro", "icono perpetuo socorro"],
    category: "novenas"
  },
  {
    slug: "los-evangelios-y-sus-autores",
    title: "Los Cuatro Evangelios — Autores, Fecha y Características",
    description: "Los evangelios de Mateo, Marcos, Lucas y Juan: quiénes los escribieron, cuándo, para quién y las características de cada uno.",
    keywords: ["los cuatro evangelios", "evangelios autores", "evangelio mateo marcos lucas juan", "evangelios sinopticos", "evangelio juan"],
    category: "biblia"
  },
  {
    slug: "milagros-de-jesus-en-la-biblia",
    title: "Los Milagros de Jesús en la Biblia — Lista Completa",
    description: "Los 37 milagros de Jesús narrados en los Evangelios: curaciones, exorcismos, milagros sobre la naturaleza y resurrecciones.",
    keywords: ["milagros de jesus", "milagros biblia", "curaciones jesus", "resurreccion lazaro", "bodas de cana"],
    category: "biblia"
  },
  {
    slug: "oración-por-los-enfermos",
    title: "Oración por los Enfermos — Para Pedir Sanación",
    description: "Oraciones católicas por los enfermos: unción de enfermos, oración de sanación, intercesión de santos y el sacramento de la unción.",
    keywords: ["oracion por los enfermos", "sanacion catolicismo", "unccion de enfermos", "oracion sanacion", "sacramento enfermos"],
    category: "oraciones"
  },
  {
    slug: "novena-a-jesus-misericordioso",
    title: "Novena a Jesús Misericordioso — Imagen de Santa Faustina",
    description: "Novena a la imagen de Jesús Misericordioso según el diario de Santa Faustina: los 9 días, la jaculatoria y la promesa de misericordia.",
    keywords: ["novena jesus misericordioso", "oracion jesus misericordioso", "imagen misericordiosa", "faustina jesus misericordioso"],
    category: "novenas"
  },
  {
    slug: "que-es-el-apocalipsis-biblia",
    title: "¿Qué es el Apocalipsis? — Interpretación Católica",
    description: "El libro del Apocalipsis según la interpretación católica: autor, contexto histórico, el 666, los cuatro jinetes y el mensaje esperanzador.",
    keywords: ["apocalipsis biblia", "apocalipsis interpretacion", "666 biblia", "cuatro jinetes", "apocalipsis juan"],
    category: "biblia"
  },
  {
    slug: "retiro-espiritual-para-catolicos",
    title: "¿Qué es un Retiro Espiritual? — Guía Católica",
    description: "Los retiros espirituales en el catolicismo: tipos, duración, cómo prepararse, ejercicios espirituales ignacianos y beneficios.",
    keywords: ["retiro espiritual", "retiro espiritual catolico", "ejercicios espirituales retiro", "como hacer retiro espiritual"],
    category: "espiritualidad"
  },
  {
    slug: "novena-a-san-jorge-martir",
    title: "Novena a San Jorge Mártir — El Guerrero de la Fe",
    description: "Novena completa a San Jorge Mártir: historia del santo, leyenda del dragón, oraciones de los 9 días y su devoción popular.",
    keywords: ["novena san jorge", "san jorge martir novena", "oracion san jorge", "san jorge dragon"],
    category: "novenas"
  },
  {
    slug: "evangelio-segun-san-juan",
    title: "Evangelio según San Juan — Introducción y Temas Clave",
    description: "El Evangelio de Juan: prólogo del Verbo encarnado, los 7 signos, los discursos de Jesús, la Pasión y la teología del Espíritu.",
    keywords: ["evangelio san juan", "juan 1 1", "en el principio era el verbo", "logos juan", "juan evangelio teologia"],
    category: "biblia"
  },
  {
    slug: "que-es-la-penitencia-sacramento",
    title: "¿Qué es el Sacramento de la Penitencia?",
    description: "El Sacramento de la Penitencia o Reconciliación: actos del penitente, absolución, formas de absolución, efectos y quién puede administrarlo.",
    keywords: ["sacramento penitencia", "penitencia confesion", "reconciliacion sacramento", "absolución sacramental", "confesion forma materia"],
    category: "sacramentos"
  },
  {
    slug: "devocion-a-la-virgen-maria",
    title: "Devociones Marianas — Las Más Importantes del Catolicismo",
    description: "Las principales devociones marianas: el Rosario, el escapulario del Carmen, la Medalla Milagrosa, las letanías lauretanas y la Salve.",
    keywords: ["devocion virgen maria", "devociones marianas", "escapulario carmelita", "letanias lauretanas", "rosario virgen"],
    category: "mariologia"
  },
  {
    slug: "novena-a-san-lazaro",
    title: "Novena a San Lázaro — El Amigo de Jesús",
    description: "Novena completa a San Lázaro: historia bíblica de la resurrección de Lázaro, devoción popular y oraciones de los 9 días.",
    keywords: ["novena san lazaro", "san lazaro novena", "oracion san lazaro", "resurreccion lazaro novena"],
    category: "novenas"
  },
  {
    slug: "que-es-la-iglesia-catolica-definicion",
    title: "¿Qué es la Iglesia Católica? — Definición y Características",
    description: "La Iglesia Católica: sus cuatro notas (una, santa, católica y apostólica), fundación por Cristo, estructura jerárquica y misión.",
    keywords: ["que es la iglesia catolica", "iglesia una santa catolica apostolica", "fundacion iglesia", "iglesia de cristo", "iglesia definicion"],
    category: "eclesiologia"
  },
  {
    slug: "como-rezar-el-angelus",
    title: "El Ángelus — Oración Completa y Cuándo Rezarlo",
    description: "El Ángelus completo: texto de la oración, versículos bíblicos, historia, cuándo se reza (6am, 12pm, 6pm) y el Regina Caeli en Pascua.",
    keywords: ["angelus oracion", "como rezar el angelus", "angelus completo", "regina caeli", "oracion del mediodia"],
    category: "oraciones"
  },
  {
    slug: "novena-a-nuestra-señora-de-chiquinquira",
    title: "Novena a Nuestra Señora de Chiquinquirá — Patrona de Colombia",
    description: "Novena completa a la Virgen de Chiquinquirá, patrona de Colombia: historia del milagro, oraciones de los 9 días y la fiesta del 9 de julio.",
    keywords: ["novena virgen chiquinquira", "nuestra señora chiquinquira", "patrona colombia novena", "virgen colombia novena"],
    category: "novenas"
  },
  {
    slug: "que-es-el-ecumenismo",
    title: "¿Qué es el Ecumenismo? — La Iglesia y el Diálogo Cristiano",
    description: "El ecumenismo en la Iglesia Católica: qué es, el Decreto Unitatis Redintegratio del Vaticano II, relaciones con protestantes y ortodoxos.",
    keywords: ["ecumenismo", "ecumenismo catolicismo", "dialogo ecumenico", "unidad cristiana", "catolicismo ortodoxia dialogo"],
    category: "ecumenismo"
  },
  {
    slug: "oracion-por-colombia-y-latinoamerica",
    title: "Oración por Colombia y Latinoamérica — Intercesión Nacional",
    description: "Oraciones católicas por Colombia y los pueblos latinoamericanos: por la paz, la justicia, los líderes y la conversión de los pueblos.",
    keywords: ["oracion por colombia", "oracion por latinoamerica", "oracion paz colombia", "intercesion nacion", "oracion por el pais"],
    category: "oraciones"
  },
  {
    slug: "novena-de-navidad-del-16-al-24",
    title: "Novena de Navidad — Del 16 al 24 de Diciembre",
    description: "La Novena de Navidad completa: oraciones de los 9 días, villancicos tradicionales, historia de la novena y celebración en familia.",
    keywords: ["novena de navidad", "novena navidad 16 al 24", "novena navidad colombia", "novena navideña tradicional"],
    category: "novenas"
  },
  {
    slug: "que-es-el-magisterio-de-la-iglesia",
    title: "¿Qué es el Magisterio de la Iglesia Católica?",
    description: "El Magisterio ordinario y extraordinario: qué es, quiénes lo ejercen, diferencia entre doctrina definida y no definida, y obediencia del fiel.",
    keywords: ["magisterio iglesia", "magisterio ordinario extraordinario", "obediencia magisterio", "doctrina iglesia", "ensenanza iglesia"],
    category: "doctrina"
  },
  {
    slug: "santos-medicos-y-sanadores",
    title: "Santos Médicos y Sanadores — Patrones de la Salud",
    description: "Los santos patrones de la salud y los médicos: San Lucas, San Cosme y Damián, Santa Rafaela, San Camilo de Lelis y sus historias.",
    keywords: ["santos medicos", "patron medicos", "santos sanadores", "san lucas evangelista medico", "san cosme y damian"],
    category: "santos"
  },
  {
    slug: "novena-a-santa-barbara",
    title: "Novena a Santa Bárbara — Patrona de los Artilleros",
    description: "Novena completa a Santa Bárbara: historia y martirio de la santa, oraciones de los 9 días y devoción en Latinoamérica.",
    keywords: ["novena santa barbara", "santa barbara novena", "oracion santa barbara", "santa barbara martir"],
    category: "novenas"
  },
  {
    slug: "la-pasion-de-cristo-via-crucis",
    title: "El Vía Crucis — Las 14 Estaciones Completas",
    description: "El Vía Crucis completo: las 14 estaciones de la Pasión de Cristo, texto de cada estación, meditación y oraciones.",
    keywords: ["via crucis", "estaciones via crucis", "via crucis completo", "viacrucis 14 estaciones", "pasion de cristo"],
    category: "liturgia"
  },
  {
    slug: "novena-a-san-gregorio",
    title: "Novena de San Gregorio — Para Conversión de Pecadores",
    description: "La Novena de San Gregorio Magno para la conversión de pecadores: historia, oraciones de los 9 días y 30 misas gregorianas.",
    keywords: ["novena san gregorio", "san gregorio novena", "misas gregorianas", "novena conversion pecadores"],
    category: "novenas"
  },
  {
    slug: "biblia-libros-deuterocanonicas",
    title: "Los Libros Deuterocanónicos — ¿Por qué los Tiene el Catolicismo?",
    description: "Los 7 libros deuterocanónicos: Tobías, Judit, 1 y 2 Macabeos, Sabiduría, Sirácida y Baruc. Por qué los tiene la Biblia católica y no la protestante.",
    keywords: ["libros deuterocanonicas", "biblia catolica vs protestante libros", "apocrifos biblia", "biblia 73 libros", "canon biblico"],
    category: "biblia"
  },
  {
    slug: "que-es-el-ayuno-y-la-abstinencia",
    title: "¿Qué es el Ayuno y la Abstinencia Católica?",
    description: "Ayuno y abstinencia en el catolicismo: cuándo es obligatorio, días de ayuno, edades, diferencia entre ayuno y abstinencia y valor espiritual.",
    keywords: ["ayuno catolicismo", "abstinencia iglesia", "ayuno viernes", "miercoles ceniza ayuno", "cuaresma ayuno"],
    category: "moral"
  },
  {
    slug: "novena-a-san-nicolas-de-tolentino",
    title: "Novena a San Nicolás de Tolentino — Las Ánimas del Purgatorio",
    description: "Novena completa a San Nicolás de Tolentino, patrono de las almas del purgatorio: oraciones de los 9 días e historia del santo.",
    keywords: ["novena san nicolas tolentino", "san nicolas tolentino novena", "oracion almas purgatorio nicolas"],
    category: "novenas"
  },
  {
    slug: "que-dice-la-iglesia-sobre-la-homosexualidad",
    title: "¿Qué dice la Iglesia Católica sobre la Homosexualidad?",
    description: "La doctrina católica sobre la homosexualidad: Catecismo CIC 2357-2359, la distinción entre tendencia y actos, y el llamado a la castidad.",
    keywords: ["iglesia homosexualidad", "catolicismo homosexualidad", "catecismo homosexualidad", "dignidad persona homosexual"],
    category: "moral"
  },
  {
    slug: "papa-francisco-ensenanzas",
    title: "Papa Francisco — Principales Enseñanzas y Documentos",
    description: "Las principales enseñanzas del Papa Francisco: Laudato Si, Amoris Laetitia, Evangelii Gaudium, Fratelli Tutti y su visión de la Iglesia.",
    keywords: ["papa francisco enseñanzas", "papa francisco documentos", "laudato si", "evangelii gaudium", "francisco pontificado"],
    category: "magisterio"
  },
  {
    slug: "novena-a-la-santa-cruz",
    title: "Novena a la Santa Cruz — Triunfo de la Cruz",
    description: "Novena completa a la Santa Cruz: historia del hallazgo de la Cruz por Santa Elena, oraciones de los 9 días y fiesta del 14 de septiembre.",
    keywords: ["novena santa cruz", "exaltacion santa cruz", "novena triunfo cruz", "14 septiembre santa cruz"],
    category: "novenas"
  },
  {
    slug: "la-oracion-del-credo-apostolico",
    title: "El Credo Apostólico — Texto Completo y Artículos de Fe",
    description: "El Credo Apostólico completo: texto, los 12 artículos de fe, diferencias con el Credo Niceno-Constantinopolitano y su uso en el Rosario.",
    keywords: ["credo apostolico", "creo en dios padre", "simbolo apostolico", "articulos de fe", "credo texto completo"],
    category: "doctrina"
  },
  {
    slug: "novena-a-san-cayetano",
    title: "Novena a San Cayetano — Patrono del Trabajo y el Pan",
    description: "Novena completa a San Cayetano de Thiene, patrono del trabajo y el pan: oraciones de los 9 días, historia e intercesión.",
    keywords: ["novena san cayetano", "san cayetano patrono trabajo", "oracion san cayetano", "7 agosto san cayetano"],
    category: "novenas"
  },
];

module.exports = SEO_TOPICS;
