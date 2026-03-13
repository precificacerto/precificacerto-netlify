const express = require('express');
const app = express();
const PORT = 3000;

// Rota principal
app.get('/', (req, res) => {
  res.send('<h1>Bem-vindo ao Precifica Certo!</h1>');
});

// Iniciar o servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});