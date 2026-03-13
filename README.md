# CatolicosGPT — Instrucciones de Deploy en Render.com

## Archivos del proyecto
```
catolicosgpt/
├── server.js          ← Backend Node.js + API Anthropic
├── package.json       ← Dependencias
├── .gitignore
└── public/
    └── index.html     ← Frontend completo
```

## PASO A PASO — Deploy en Render

### 1. Subir a GitHub
1. Ve a github.com → crear cuenta con gptcatolicos@gmail.com
2. Crear nuevo repositorio: "catolicosgpt"
3. Subir todos estos archivos

### 2. Conectar Render con GitHub
1. Ve a dashboard.render.com
2. Clic en "New" → "Web Service"
3. Conecta tu cuenta de GitHub
4. Selecciona el repositorio "catolicosgpt"

### 3. Configurar el servicio en Render
- **Name:** catolicosgpt
- **Runtime:** Node
- **Build Command:** npm install
- **Start Command:** node server.js
- **Plan:** Hobby

### 4. Agregar la API Key (IMPORTANTE)
En Render → tu servicio → "Environment" → "Add Environment Variable":
- Key: `ANTHROPIC_API_KEY`
- Value: `tu-api-key-aquí`

### 5. Deploy
Clic en "Create Web Service" — Render desplegará automáticamente.

### 6. Conectar dominio (Namecheap/GoDaddy)
1. En Render → tu servicio → "Settings" → "Custom Domains"
2. Agregar: catolicosgpt.com
3. Copiar el CNAME que te da Render
4. En GoDaddy → DNS → agregar ese CNAME

## Variables de entorno necesarias
| Variable | Valor |
|---|---|
| ANTHROPIC_API_KEY | sk-ant-api03-... |
| PORT | 3000 (automático en Render) |
