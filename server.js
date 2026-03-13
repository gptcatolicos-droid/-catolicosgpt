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
Eres CatolicosGPT, un asistente teológico católico experto.

Hablas con respeto y claridad.
Siempre sigues las enseñanzas del Magisterio de la Iglesia.

Solo respondes temas relacionados con:
- Biblia
- Catecismo
- Liturgia
- Sacramentos
- Santos
- Espiritualidad católica
`;


// ============================
// CHAT IA
// ============================

app.post('/api/chat', async (req, res) => {

  const { messages } = req.body;

  try {

    const completion = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...messages
      ],
      max_tokens: 500,
      temperature: 0.3
    });

    res.json({
      reply: completion.choices[0].message.content
    });

  } catch (error) {

    console.log(error);

    res.json({
      reply: "No pude responder en este momento."
    });

  }

});


// =======================================
// LECTURAS DEL DÍA (Universalis)
// =======================================

app.get('/api/lecturas', async (req,res)=>{

try{

const today = new Date()

const yyyy = today.getFullYear()
const mm = String(today.getMonth()+1).padStart(2,'0')
const dd = String(today.getDate()).padStart(2,'0')

const url = `https://universalis.com/${yyyy}${mm}${dd}/jsonpmass.js`

const response = await fetch(url)
const text = await response.text()

const json = JSON.parse(text.replace("universalisCallback(", "").slice(0,-2))

const first = json.Mass_R1 || "Lectura no disponible"
const psalm = json.Mass_Ps || "Salmo no disponible"
const gospel = json.Mass_G || "Evangelio no disponible"

res.json({
first_reading:first,
psalm:psalm,
gospel:gospel
})

}catch(e){

console.log(e)

res.json({
first_reading:"No disponible",
psalm:"No disponible",
gospel:"No disponible"
})

}

})


// =======================================
// LAUDES (Universalis)
// =======================================

app.get('/api/laudes', async (req,res)=>{

try{

const today = new Date()

const yyyy = today.getFullYear()
const mm = String(today.getMonth()+1).padStart(2,'0')
const dd = String(today.getDate()).padStart(2,'0')

const url = `https://universalis.com/${yyyy}${mm}${dd}/jsonp-lauds.js`

const response = await fetch(url)
const text = await response.text()

const json = JSON.parse(text.replace("universalisCallback(", "").slice(0,-2))

res.json({
laudes: json.text || "Laudes no disponibles hoy"
})

}catch(e){

res.json({
laudes:"No disponible"
})

}

})


// =======================================
// ROSARIO
// =======================================

app.get('/api/rosario',(req,res)=>{

res.json({

rosario:`

📿 SANTO ROSARIO

Señal de la cruz

Credo

Padre Nuestro

3 Avemarías

Misterios del día

Lunes y sábado — Gozosos  
Martes y viernes — Dolorosos  
Miércoles y domingo — Gloriosos  
Jueves — Luminosos  

Salve Regina

`

})

})


// =======================================
// SANTO DEL DÍA
// =======================================

app.get('/api/santo',(req,res)=>{

const today = new Date()

const santos = [
"San José",
"San Francisco de Asís",
"San Benito",
"Santa Teresa de Jesús",
"San Juan Pablo II",
"San Agustín",
"San Ignacio de Loyola"
]

const santo = santos[today.getDate() % santos.length]

res.json({
santo:santo
})

})



const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`CatolicosGPT corriendo en puerto ${PORT}`);
});
