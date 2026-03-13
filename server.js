
const express = require('express');
const cors = require('cors');
const path = require('path');
const fetch = require('node-fetch');
const OpenAI = require("openai");
const catecismo = require("./data/catecismo.json");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const SYSTEM_PROMPT = `
Eres CatolicosGPT, un asistente teológico católico experto.
Respondes usando Biblia, Catecismo y doctrina católica.
`;

function buscarContexto(pregunta){
const texto=pregunta.toLowerCase();
return catecismo
.filter(i=>texto.includes(i.tema))
.map(i=>i.texto)
.join("\n");
}

app.post('/api/chat', async (req,res)=>{

const {messages}=req.body;
const pregunta=messages[messages.length-1].content;
const contexto=buscarContexto(pregunta);

try{

const completion=await openai.chat.completions.create({
model:"gpt-5-mini",
messages:[
{role:"system",content:SYSTEM_PROMPT},
{role:"system",content:"Contexto doctrinal:"+contexto},
...messages
],
max_tokens:500
});

res.json({reply:completion.choices[0].message.content});

}catch(e){

res.json({reply:"Error generando respuesta."});

}

});


app.get('/api/lecturas',(req,res)=>{

const today=new Date();
const yyyy=today.getFullYear();
const mm=String(today.getMonth()+1).padStart(2,'0');
const dd=String(today.getDate()).padStart(2,'0');

const url=`https://bible.usccb.org/bible/readings/${mm}${dd}${yyyy}.cfm`;

res.json({
first_reading:"Consulta: "+url,
psalm:"Salmo disponible en la página oficial",
gospel:"Evangelio disponible en la página oficial"
});

});

app.get('/api/laudes',(req,res)=>{

res.json({
laudes:`
Señor abre mis labios
y mi boca proclamará tu alabanza.

Bendito sea el Señor Dios de Israel.
Padre nuestro que estás en el cielo.

Amén.
`
})

});

app.get('/api/rosario',(req,res)=>{

res.json({
rosario:`
SANTO ROSARIO

Credo
Padre Nuestro
3 Avemarías

Misterios del día:
Lunes y sábado: Gozosos
Martes y viernes: Dolorosos
Miércoles y domingo: Gloriosos
Jueves: Luminosos
`
})

});

app.get('/api/santo',(req,res)=>{
res.json({santo:"Consulta el santoral oficial en vatican.va"})
});

const PORT=process.env.PORT||3000;
app.listen(PORT,()=>console.log("CatolicosGPT corriendo"));
