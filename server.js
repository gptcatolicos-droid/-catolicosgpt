const express = require('express');
const cors = require('cors');
const path = require('path');
const fetch = require('node-fetch');
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

Hablas como un sacerdote sabio y pastoral.
Siempre respetas el Magisterio de la Iglesia Católica.

Respondes sobre:
- Biblia
- Catecismo
- Liturgia
- Sacramentos
- Espiritualidad
- Santos

No respondes temas fuera de la fe católica.
`;

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

  try {

    const respuesta = await preguntarOpenAI(messages);

    res.json({ reply: respuesta });

  } catch (error) {

    console.log(error);

    res.json({
      reply: "No pude responder en este momento."
    });

  }

});


// =======================================
// LECTURAS DEL DÍA
// =======================================

app.get('/api/lecturas', async (req,res)=>{

  try{

    const today = new Date();

    const yyyy = today.getFullYear();
    const mm = String(today.getMonth()+1).padStart(2,'0');
    const dd = String(today.getDate()).padStart(2,'0');

    const url = `https://bible.usccb.org/bible/readings/${mm}${dd}${yyyy}.cfm`;

    res.json({
      first_reading: "Consulta oficial: " + url,
      psalm: "Salmo responsorial disponible en la página oficial",
      gospel: "Evangelio disponible en la página oficial"
    });

  }catch(e){

    res.json({
      first_reading: "No disponible",
      psalm: "No disponible",
      gospel: "No disponible"
    });

  }

});


// =======================================
// LITURGIA DE LAS HORAS (LAUDES)
// =======================================

app.get('/api/laudes', async (req,res)=>{

res.json({

laudes: `
LAUDES – ORACIÓN DE LA MAÑANA

Señor abre mis labios  
y mi boca proclamará tu alabanza

Himno

Oh Dios ven en mi ayuda  
Señor date prisa en socorrerme

Salmo

Alaben al Señor desde los cielos  
alábenlo en las alturas

Lectura breve

Bendito sea Dios Padre de nuestro Señor Jesucristo

Cántico de Zacarías

Bendito sea el Señor Dios de Israel

Padre Nuestro

Padre nuestro que estás en el cielo

Oración final

Señor dirige y santifica este día

Amén
`

})

})


// =======================================
// ROSARIO
// =======================================

app.get('/api/rosario',(req,res)=>{

res.json({

rosario:`
SANTO ROSARIO

Señal de la cruz

Credo

Padre Nuestro

3 Avemarías

Misterios del día

Lunes y sábado: Gozosos  
Martes y viernes: Dolorosos  
Miércoles y domingo: Gloriosos  
Jueves: Luminosos

Salve Regina
`

})

})


// =======================================
// SANTO DEL DÍA
// =======================================

app.get('/api/santo',(req,res)=>{

res.json({
santo:"Puedes consultar el santo del día en https://www.vatican.va"
})

})



const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`CatolicosGPT corriendo en puerto ${PORT}`);
});
