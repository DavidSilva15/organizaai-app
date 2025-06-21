const mysql = require('mysql2');

const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'organizaai'
});

connection.connect((err) => {
    if (err) throw err;
    console.log('Conectado ao MySQL');
});

module.exports = connection;


/*
script para criar o db e as tabelas

CREATE DATABASE organizaai;

CREATE TABLE usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    senha VARCHAR(255) NOT NULL
);

CREATE TABLE tarefas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT,
    titulo VARCHAR(255) NOT NULL,
    descricao TEXT,
    prioridade ENUM('Baixo', 'Médio', 'Alto') NOT NULL,
    status ENUM('Pendente', 'Concluída') DEFAULT 'Pendente',
    data_criacao DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);
*/
