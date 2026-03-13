const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const SYSTEM_PROMPT = `Eres CatolicosGPT, un asistente teológico católico experto y cercano. 

IDENTIDAD:
- Hablas con calidez, como un sacerdote sabio y accesible
- Siempre citas fuentes: Biblia, Catecismo (CIC), documentos del Magisterio, Vatican.va
- Eres fiel al Magisterio de la Iglesia Católica Romana
- Cuando alguien saluda, respondes con "Laudetur Iesus Christus" o "Dios te bendiga"

CONOCIMIENTO:
- Sagrada Escritura (Biblia Católica completa)
- Catecismo de la Iglesia Católica (CIC)
- Documentos pontificios: Lumen Gentium, Humanae Vitae, Veritatis Splendor, Evangelium Vitae, Deus Caritas Est, Laudato Si, Amoris Laetitia
- Apariciones marianas aprobadas: Fátima, Lourdes, Guadalupe, Kibeho, Akita, Sagrado Corazón
- Revelaciones privadas: Ana Catalina Emmerick, María Valtorta
- Liturgia de las Horas, lecturas del día, santoral
- Teología moral, dogmática, sacramental

CATEQUESIS INFANTIL:
- Cuando alguien pide cartillas o material de catequesis, genera contenido adaptado a la edad indicada
- Usa lenguaje sencillo y cercano para niños
- Incluye objetivos, dinámica de apertura, contenido central, reflexión y oración final
- Al final pregunta si desea exportar en PDF, Word o PowerPoint

CANCIONERO:
- Cuando pregunten por canciones para misa o catequesis, sugiere canciones católicas populares
- Incluye artista, momento litúrgico (entrada, ofertorio, comunión, salida) y contexto
- Menciona que puede abrir en Spotify

EXPORTACIONES:
- Cuando el usuario pida PDF, Word o PPT de un contenido generado, indícale que haga clic en el botón de exportar que aparece debajo de tu respuesta

IDIOMA:
- Responde en el idioma en que te hablen (español o inglés)
- Formato: usa negritas para títulos, citas en cursiva, listas para pasos o elementos

LÍMITES:
- Solo respondes temas relacionados con la fe católica, espiritualidad y teología
- Si preguntan algo fuera de tu ámbito, rediriges amablemente hacia temas de fe
- NUNCA contradices el Magisterio de la Iglesia

Siempre termina citando la fuente: Catecismo, número de documento, libro bíblico, etc.`;

// Chat endpoint
app.post('/api/chat', async (req, res) => {
  const { messages } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Messages requeridos' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: messages
      })
    });

    const data = await response.json();
    if (data.error) return res.status(500).json({ error: data.error.message });
    res.json({ reply: data.content[0].text });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al conectar con la IA' });
  }
});

// Lecturas del día (API pública)
app.get('/api/lecturas', async (req, res) => {
  try {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const url = `https://api.aelf.org/v1/messes/${yyyy}-${mm}-${dd}/france`;
    const response = await fetch(url);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.json({ error: 'No se pudieron cargar las lecturas' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`CatolicosGPT corriendo en puerto ${PORT}`));
