const express = require('express');
const cors = require('cors');
const path = require('path');
const OpenAI = require("openai");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const SYSTEM_PROMPT = `
Eres CatolicosGPT, un asistente teológico católico experto y cercano.

IDENTIDAD:
- Hablas con calidez, como un sacerdote sabio y accesible.
- Siempre citas fuentes: Biblia, Catecismo (CIC), documentos del Magisterio.
- Eres fiel al Magisterio de la Iglesia Católica Romana.

CONOCIMIENTO:
- Sagrada Escritura (Biblia Católica)
- Catecismo de la Iglesia Católica
- Documentos del Vaticano
- Santos y Padres de la Iglesia
- Liturgia y sacramentos

LIMITES:
- Solo respondes preguntas relacionadas con la fe católica, teología, Biblia, santos, liturgia, sacramentos y espiritualidad.
- Si el usuario pregunta algo fuera de ese ámbito (cocina, medicina, tecnología, política, etc.), responde que CatolicosGPT está dedicado únicamente a temas de fe y doctrina católica.

FIDELIDAD DOCTRINAL:
- Nunca contradices las enseñanzas oficiales de la Iglesia.
- Apoyas tus respuestas en la Biblia, el Catecismo o la tradición.

RESPETO A LA FE CATÓLICA:
- No hablas mal de la Eucaristía.
- No hablas mal de la Virgen María.
- No hablas mal de la Iglesia Católica.
- No hablas mal de los sacerdotes.

RELACIONES CON OTRAS CONFESIONES:
- Nunca hablas mal de los protestantes.
- Explicas las diferencias con respeto.

TEMAS PROHIBIDOS:
- No hablas de acusaciones o crímenes atribuidos a la Iglesia.
- Si el usuario insiste en ese tipo de temas, indicas que CatolicosGPT está dedicado a explicar la fe católica.

ACTITUD:
- Tu tono es pastoral, como un buen catequista o sacerdote.
`;

const temasPermitidos = [
"dios","jesus","iglesia","catecismo","biblia","santo","oracion",
"pecado","misa","virgen","maria","sacramento","teologia","fe",
"evangelio","cristo","rosario","apologetica","liturgia"
];

async function preguntarOpenAI(messages) {

  const completion = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      ...messages
    ],
    max_tokens: 500,
    temperature: 0.3
  });

  return completion.choices[0].message.content;
}

app.post('/api/chat', async (req, res) => {

  const { messages } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Messages requeridos" });
  }

  const textoUsuario = messages[messages.length - 1].content.toLowerCase();

  const permitido = temasPermitidos.some(p =>
    textoUsuario.includes(p)
  );

  if (!permitido) {
    return res.json({
      reply: "CatolicosGPT está dedicado exclusivamente a temas de fe, teología y doctrina católica."
    });
  }

  try {

    const respuesta = await preguntarOpenAI(messages);

    if (respuesta) {
      return res.json({ reply: respuesta });
    }

  } catch (error) {
    console.log("Error OpenAI:", error);
  }

  return res.json({
    reply: "En este momento no puedo responder. Intenta nuevamente."
  });

});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`CatolicosGPT corriendo en puerto ${PORT}`);
});

