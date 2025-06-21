const express = require('express');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const db = require('./database');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const port = 3000;

app.set('io', io);
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

app.use(session({
    secret: 'chave_secreta_segura',
    resave: false,
    saveUninitialized: false
}));


// 🏠 Tela de cadastro
app.get('/register', (req, res) => {
    res.send(`
        <h1>Cadastro</h1>
        <form action="/register" method="POST">
            <input type="text" name="nome" placeholder="Nome de usuário" required/><br/>
            <input type="email" name="email" placeholder="E-mail" required/><br/>
            <input type="password" name="senha" placeholder="Senha" required/><br/>
            <input type="password" name="confirmar_senha" placeholder="Confirmar senha" required/><br/>
            <button type="submit">Cadastrar</button>
        </form>
        <p>Já tem uma conta? <a href="/login">Login</a></p>
    `);
});

app.post('/register', (req, res) => {
    const { nome, email, senha, confirmar_senha } = req.body;

    if (senha !== confirmar_senha) {
        return res.send('Senhas não coincidem. <a href="/register">Voltar</a>');
    }

    db.query('SELECT * FROM usuarios WHERE email = ?', [email], (err, results) => {
        if (err) throw err;

        if (results.length > 0) {
            return res.send('Email já cadastrado. <a href="/register">Voltar</a>');
        }

        const hash = bcrypt.hashSync(senha, 8);

        db.query('INSERT INTO usuarios (nome, email, senha) VALUES (?, ?, ?)', [nome, email, hash], (err) => {
            if (err) throw err;
            res.send('Usuário cadastrado com sucesso! <a href="/login">Fazer login</a>');
        });
    });
});

app.post('/usuario/editar', async (req, res) => {
    if (!req.session.usuario) {
        return res.redirect('/login');
    }

    const userId = req.session.usuario.id;  // Assumindo que você guarda o ID do usuário na sessão
    const { nome, email, senha } = req.body;

    // Validações básicas
    if (!nome || !email) {
        return res.status(400).send('Nome e email são obrigatórios.');
    }

    try {
        let query = '';
        let params = [];

        if (senha && senha.trim() !== '') {
            // Se senha foi informada, gera hash e atualiza senha também
            const hash = await bcrypt.hash(senha, 10);
            query = 'UPDATE usuarios SET nome = ?, email = ?, senha = ? WHERE id = ?';
            params = [nome, email, hash, userId];
        } else {
            // Senha não informada, atualiza só nome e email
            query = 'UPDATE usuarios SET nome = ?, email = ? WHERE id = ?';
            params = [nome, email, userId];
        }

        db.query(query, params, (err, result) => {
            if (err) {
                console.error('Erro ao atualizar usuário:', err);
                return res.status(500).send('Erro ao atualizar usuário');
            }

            // Atualiza a sessão com os novos dados
            req.session.usuario.nome = nome;
            req.session.usuario.email = email;

            // Redireciona de volta para o dashboard ou mostra mensagem
            res.redirect('/dashboard');
        });
    } catch (error) {
        console.error('Erro na edição do usuário:', error);
        res.status(500).send('Erro interno');
    }
});


// 🔑 Tela de login
app.get('/login', (req, res) => {
    res.send(`
        <h1>Login</h1>
        <form action="/login" method="POST">
            <input type="email" name="email" placeholder="E-mail" required/><br/>
            <input type="password" name="senha" placeholder="Senha" required/><br/>
            <button type="submit">Entrar</button>
        </form>
        <p>Não tem uma conta? <a href="/register">Cadastre-se</a></p>
    `);
});

app.post('/login', (req, res) => {
    const { email, senha } = req.body;

    db.query('SELECT * FROM usuarios WHERE email = ?', [email], (err, results) => {
        if (err) throw err;

        if (results.length === 0) {
            return res.send('Email não encontrado. <a href="/login">Voltar</a>');
        }

        const usuario = results[0];

        if (!bcrypt.compareSync(senha, usuario.senha)) {
            return res.send('Senha incorreta. <a href="/login">Voltar</a>');
        }

        // Armazena dados na sessão
        req.session.usuario = {
            id: usuario.id,
            nome: usuario.nome,
            email: usuario.email
        };

        res.redirect('/dashboard');
    });
});


app.get('/dashboard', (req, res) => {
    if (!req.session.usuario) {
        return res.redirect('/login');
    }

    const { nome } = req.session.usuario;

    res.send(`
        <style>
            .loader {
                border: 6px solid #f3f3f3;
                border-top: 6px solid #3498db;
                border-radius: 50%;
                width: 40px;
                height: 40px;
                animation: spin 1s linear infinite;
                margin: 20px auto;
            }
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        </style>
    
        <header style="background:#eee;padding:10px;display:flex;justify-content:space-between;align-items:center;">
        <h2>Bem-vindo, ${nome}</h2>
        <div>
            <button onclick="abrirModalEditarUsuario()">Editar Perfil</button>
            <a href="/logout" style="margin-left:10px;">Sair</a>
        </div>
    </header>

    <!-- Modal Editar Usuário -->
    <div id="modalEditarUsuario" style="display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:#000000aa;align-items:center;justify-content:center;">
        <div style="background:#fff;padding:20px;min-width:300px;position:relative;">
            <h3>Editar Perfil</h3>
            <form id="formEditarUsuario" action="/usuario/editar" method="POST">
                <label>Nome:</label><br/>
                <input type="text" name="nome" id="editUserNome" value="${nome}" required /><br/><br/>

                <label>E-mail:</label><br/>
                <input type="email" name="email" id="editUserEmail" value="${req.session.usuario.email || ''}" required /><br/><br/>

                <label>Senha (deixe em branco para não alterar):</label><br/>
                <input type="password" name="senha" id="editUserSenha" placeholder="Nova senha" /><br/><br/>

                <button type="submit">Salvar Alterações</button>
                <button type="button" onclick="fecharModalEditarUsuario()">Cancelar</button>
            </form>
        </div>
    </div>

    <!-- 🔎 Barra de Filtros -->
    <nav style="background:#ddd;padding:10px;">
      <form id="formFiltros" style="display:flex;gap:10px;align-items:center;">
        <label>Prioridade:
          <select name="prioridade" id="filtroPrioridade">
            <option>Todas</option>
            <option>Baixo</option>
            <option>Médio</option>
            <option>Alto</option>
          </select>
        </label>
        <label>Status:
          <select name="status" id="filtroStatus">
            <option>Todos</option>
            <option>Pendente</option>
            <option>Concluída</option>
          </select>
        </label>
        <button type="submit">Filtrar</button>
        <button type="button" onclick="limparFiltros()">Limpar Filtros</button>
      </form>
    </nav>

    <main style="padding:20px;">
      <h3>Gerenciar Tarefas</h3>
      <button onclick="abrirModalCriar()">CRIAR</button>

      <div id="tarefasContainer" style="margin-top:20px;">
        <p>Carregando tarefas...</p>
        <div class="loader"></div>
      </div>
    </main>

    <!-- Modal Criar -->
    <div id="modalCriar" style="display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:#000000aa;align-items:center;justify-content:center;">
      <div style="background:#fff;padding:20px;min-width:300px;position:relative;">
        <h3>Criar Nova Tarefa</h3>
        <form id="formCriar" method="POST" action="/tarefa" onsubmit="return criarTarefa(event)">
          <label>Título:</label><br/>
          <input type="text" name="titulo" required/><br/><br/>

          <label>Descrição:</label><br/>
          <textarea name="descricao" required></textarea><br/><br/>

          <label>Prioridade:</label><br/>
          <select name="prioridade" required>
            <option value="">Selecione</option>
            <option value="Baixo">Baixo</option>
            <option value="Médio">Médio</option>
            <option value="Alto">Alto</option>
          </select><br/><br/>

          <button type="submit">Criar Tarefa</button>
          <button type="button" onclick="fecharModalCriar()">Cancelar</button>
        </form>
      </div>
    </div>

    <!-- Modal Editar -->
    <div id="modal" style="display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:#000000aa;align-items:center;justify-content:center;">
      <div style="background:#fff;padding:20px;min-width:300px;position:relative;">
        <h3>Tarefa</h3>
        <form id="formEditar" method="POST" onsubmit="return editarTarefa(event)">
          <label>Título:</label><br/>
          <input type="text" name="titulo" id="editTitulo" required/><br/><br/>

          <label>Descrição:</label><br/>
          <textarea name="descricao" id="editDescricao" required></textarea><br/><br/>

          <label>Prioridade:</label><br/>
          <select name="prioridade" id="editPrioridade" required>
            <option value="Baixo">Baixo</option>
            <option value="Médio">Médio</option>
            <option value="Alto">Alto</option>
          </select><br/><br/>

          <label>Status:</label><br/>
          <select name="status" id="editStatus" required>
            <option value="Pendente">Pendente</option>
            <option value="Concluída">Concluída</option>
          </select><br/><br/>

          <button type="submit">Salvar Alterações</button>
          <button type="button" onclick="fecharModal()">Cancelar</button>
        </form>
      </div>
    </div>

    <script src="/socket.io/socket.io.js"></script>
    <script>
      const socket = io();

      socket.on('atualizarTarefas', () => {
        carregarTarefas();
      });

      async function carregarTarefas() {
        const prioridade = document.getElementById('filtroPrioridade').value;
        const status = document.getElementById('filtroStatus').value;

        const params = new URLSearchParams();
        if (prioridade !== 'Todas') params.append('prioridade', prioridade);
        if (status !== 'Todos') params.append('status', status);

        const container = document.getElementById('tarefasContainer');
        
        // Exibe loader enquanto carrega
        container.innerHTML = '<div class="loader"></div>';

        try {
            const res = await fetch('/api/tarefas?' + params.toString());
            
            if (!res.ok) throw new Error('Erro na requisição: ' + res.status);

            const tarefas = await res.json();

            // Limpa o container assim que chega a resposta
            container.innerHTML = '';

            if (tarefas.length === 0) {
                container.innerHTML = '<p>Nenhuma tarefa encontrada.</p>';
                return;
            }

            tarefas.forEach(tarefa => {
                const div = document.createElement('div');
                div.style = "border:1px solid #ccc; padding:10px; margin:10px 0; display:flex; justify-content:space-between; align-items:center;";
                div.innerHTML = \`
                <div>
                    <strong>Por:</strong> \${tarefa.criador}<br/>
                    <strong>Título:</strong> \${tarefa.titulo}<br/>
                    <strong>Prioridade:</strong> \${tarefa.prioridade}<br/>
                    <strong>Status:</strong> \${tarefa.status}<br/>
                    <strong>Criado em:</strong> \${new Date(tarefa.data_criacao).toLocaleString()}<br/>
                </div>
                <div>
                    <button onclick="abrirModal(\${tarefa.id}, '\${tarefa.titulo.replace(/'/g, \"\\\\'\")}', '\${tarefa.descricao.replace(/'/g, \"\\\\'\")}', '\${tarefa.prioridade}', '\${tarefa.status}')">Ver / Editar</button>
                    <button onclick="alterarStatus(\${tarefa.id}, 'Concluída')">Concluída</button>
                    <button onclick="alterarStatus(\${tarefa.id}, 'Pendente')">Pendente</button>
                </div>
                \`;
                container.appendChild(div);
            });
        } catch (err) {
            console.error('Erro ao carregar tarefas:', err);
            container.innerHTML = '<p style="color:red;">Erro ao carregar tarefas.</p>';
        }
    }


      function abrirModal(id, titulo, descricao, prioridade, status) {
        document.getElementById('editTitulo').value = titulo;
        document.getElementById('editDescricao').value = descricao;
        document.getElementById('editPrioridade').value = prioridade;
        document.getElementById('editStatus').value = status;

        document.getElementById('formEditar').dataset.id = id;
        document.getElementById('modal').style.display = 'flex';
      }

      function fecharModal() {
        document.getElementById('modal').style.display = 'none';
      }

      function abrirModalCriar() {
        document.getElementById('modalCriar').style.display = 'flex';
      }

      function fecharModalCriar() {
        document.getElementById('modalCriar').style.display = 'none';
      }

      function limparFiltros() {
        document.getElementById('filtroPrioridade').value = 'Todas';
        document.getElementById('filtroStatus').value = 'Todos';
        carregarTarefas();
      }

      document.getElementById('formFiltros').addEventListener('submit', e => {
        e.preventDefault();
        carregarTarefas();
      });

      async function alterarStatus(id, status) {
        try {
          await fetch('/tarefa/' + id + '/status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ status })
          });
          // Atualiza a lista após alteração
          carregarTarefas();
        } catch (err) {
          console.error('Erro ao alterar status:', err);
        }
      }

      async function criarTarefa(event) {
        event.preventDefault();
        const form = event.target;
        const formData = new URLSearchParams(new FormData(form));
        try {
          await fetch('/tarefa', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formData
          });
          fecharModalCriar();
          carregarTarefas();
        } catch (err) {
          console.error('Erro ao criar tarefa:', err);
        }
        return false;
      }

      async function editarTarefa(event) {
        event.preventDefault();
        const form = event.target;
        const id = form.dataset.id;
        const formData = new URLSearchParams(new FormData(form));
        try {
          await fetch('/tarefa/' + id + '/editar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formData
          });
          fecharModal();
          carregarTarefas();
        } catch (err) {
          console.error('Erro ao editar tarefa:', err);
        }
        return false;
      }

      carregarTarefas();

      function abrirModalEditarUsuario() {
            document.getElementById('modalEditarUsuario').style.display = 'flex';
        }
        function fecharModalEditarUsuario() {
            document.getElementById('modalEditarUsuario').style.display = 'none';
        }
    </script>
  `);
});



// ➕ Criar tarefa
app.post('/tarefa', (req, res) => {
    if (!req.session.usuario) return res.redirect('/login');

    const { titulo, descricao, prioridade } = req.body;
    const usuarioId = req.session.usuario.id;

    const sql = 'INSERT INTO tarefas (titulo, descricao, prioridade, status, usuario_id, data_criacao) VALUES (?, ?, ?, "Pendente", ?, NOW())';

    db.query(sql, [titulo, descricao, prioridade, usuarioId], (err) => {
        if (err) throw err;

        // 🔥 Dispara atualização para todos os clientes
        const io = req.app.get('io');
        io.emit('atualizarTarefas');

        res.redirect('/dashboard');
    });
});


app.get('/api/tarefas', (req, res) => {
    if (!req.session.usuario) {
        return res.status(401).json({ error: 'Não autorizado' });
    }

    const { prioridade, status } = req.query;

    let sql = `
        SELECT tarefas.*, usuarios.nome AS criador 
        FROM tarefas 
        JOIN usuarios ON tarefas.usuario_id = usuarios.id
    `;
    const filtros = [];
    const params = [];

    if (prioridade && prioridade !== 'Todas') {
        filtros.push('tarefas.prioridade = ?');
        params.push(prioridade);
    }

    if (status && status !== 'Todos') {
        filtros.push('tarefas.status = ?');
        params.push(status);
    }

    if (filtros.length > 0) {
        sql += ' WHERE ' + filtros.join(' AND ');
    }

    sql += ' ORDER BY tarefas.data_criacao DESC';

    db.query(sql, params, (err, results) => {
        if (err) return res.status(500).json({ error: 'Erro no servidor' });

        res.json(results);
    });
});



// 🔄 Alterar status da tarefa
app.post('/tarefa/:id/status', (req, res) => {
    if (!req.session.usuario) return res.redirect('/login');

    const { id } = req.params;
    const { status } = req.body;

    const sql = 'UPDATE tarefas SET status = ? WHERE id = ?';

    db.query(sql, [status, id], (err) => {
        if (err) throw err;

        const io = req.app.get('io');
        io.emit('atualizarTarefas');

        res.redirect('/dashboard');
    });
});


app.post('/tarefa/:id/editar', (req, res) => {
    if (!req.session.usuario) return res.redirect('/login');

    const { id } = req.params;
    const { titulo, descricao, prioridade, status } = req.body;

    const sql = 'UPDATE tarefas SET titulo = ?, descricao = ?, prioridade = ?, status = ? WHERE id = ?';

    db.query(sql, [titulo, descricao, prioridade, status, id], (err) => {
        if (err) throw err;

        const io = req.app.get('io');
        io.emit('atualizarTarefas');

        res.redirect('/dashboard');
    });
});


// 🚪 Logout
app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login');
    });
});


// 🔥 Servidor rodando
http.listen(port, '0.0.0.0', () => {
    console.log(`Servidor rodando em http://localhost:${port}`);
});