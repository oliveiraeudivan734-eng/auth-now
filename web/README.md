# AUTH-NOW Web e API local

A branch inclui uma interface responsiva e uma API local de desenvolvimento em Python/SQLite para produtos, lotes, emissão de códigos individuais, verificação, revogação e registro de consultas. O banco SQLite surge na primeira inicialização. Não exponha esta API à Internet nem a use em produção sem revisão de segurança.

## Requisitos e testes

Python 3.10+; não há dependências Python externas. Na raiz do projeto execute:

```sh
python -m unittest discover -s tests -v
```

A suíte cobre autenticação administrativa, validação básica, cadastro, emissão limitada à quantidade do lote, verificação válida/repetida, código desconhecido e revogação.

## Teste no Android pela rede Wi-Fi local

1. Faça checkout da branch `feature/auth-now-web-v1`.
2. No computador, crie um token de teste longo. macOS/Linux:
   `export AUTHNOW_ADMIN_TOKEN="$(python -c 'import secrets; print(secrets.token_urlsafe(32))')"`
   PowerShell:
   `$env:AUTHNOW_ADMIN_TOKEN = (py -c "import secrets; print(secrets.token_urlsafe(32))")`
3. Na raiz, inicie a API: `python api/server.py` (Windows: `py api/server.py`). Ela usa a porta 8080 e cria `api/auth-now.sqlite3`.
4. Em outro terminal, inicie a interface: `python -m http.server 8000 --directory web` (Windows: `py -m http.server 8000 --directory web`).
5. Conecte Android e computador à mesma Wi-Fi. Descubra o IP local do computador (`ipconfig` no Windows; `hostname -I` no Linux; configurações Wi-Fi no macOS) e no Chrome Android abra `http://IP-DO-COMPUTADOR:8000`.
6. Na página **Configurações**, informe `http://IP-DO-COMPUTADOR:8080` como URL da API e salve. Permita no firewall somente o acesso em rede privada, se solicitado.
7. Cadastre produto e lote. Na primeira operação administrativa, informe o token definido no passo 2; o token fica apenas em memória na aba atual. Gere QR Codes e teste-os digitando/colando o token na tela de verificação. A primeira verificação válida mostra **PRODUTO ORIGINAL** e dados do produto. Uma consulta repetida continua sendo registrada como válida, com aviso de possível reutilização não conclusivo.
8. Pressione Ctrl+C nos dois terminais ao acabar. Para apagar os dados de teste, pare a API e remova `api/auth-now.sqlite3`.

A câmera costuma exigir HTTPS ou localhost por regra dos navegadores; em HTTP na rede local, use a entrada manual do código. Não use credenciais reais nem dados sensíveis nesse teste. CORS amplo e HTTP existem apenas para facilitar o teste local.

## Rotas

| Método/rota | Acesso | Descrição |
| --- | --- | --- |
| `GET /health` | público | Estado da API |
| `GET/POST /admin/products` | Bearer admin | Lista/cria produtos |
| `GET/POST /admin/lots` | Bearer admin | Lista/cria lotes |
| `POST /admin/lots/{id}/qrcodes` | Bearer admin | Emite tokens aleatórios, sem ultrapassar unidades disponíveis |
| `POST /auth/verify` | público | Registra consulta e verifica o código |
| `DELETE /admin/codes/{id}` | Bearer admin | Revoga código individual |

Tokens são gerados com `secrets` e apenas o SHA-256 é armazenado; o token puro é retornado uma única vez. Consultas válidas repetidas são sinalizadas sem concluir falsificação. O frontend só exibe **PRODUTO ORIGINAL** após resposta HTTP bem-sucedida cujo JSON tenha `ok: true`.

## Limitações antes de produção

Protótipo local: autenticação administrativa por token estático compartilhado, sem gestão de usuários, expiração ou rate limiting; sem HTTPS/TLS, backups, trilha inviolável ou endurecimento de produção. Use HTTPS, contas individuais, gestão segura de segredos, limitação de requisições e revisão de segurança antes de implantar. A leitura pela câmera depende de contexto seguro e suporte `BarcodeDetector`; digitação/colagem funciona como alternativa.
