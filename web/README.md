# AUTH-NOW Web

Primeira interface web responsiva para administração do catálogo AUTH-NOW, cadastro de produtos e lotes, solicitação de QR Codes e consulta de autenticidade.

## Abrir localmente

Abra `index.html` em um navegador ou sirva a pasta `web/` com um servidor estático. A interface não precisa de build nem de dependências locais. A biblioteca QRCode é carregada de CDN para desenhar, no navegador, os tokens de QR Code devolvidos pela API.

## Conectar a API

Em **Configurações**, informe a URL base HTTPS da API. A URL é guardada no `localStorage` deste navegador; não coloque segredos ou chaves de API no frontend. Configure CORS, autenticação administrativa, autorização e validação no servidor.

Esta primeira versão usa o seguinte contrato HTTP esperado (JSON):

- `GET /admin/products` → lista JSON ou `{ "products": [...] }`.
- `POST /admin/products` → recebe `name`, `category`, `brand`, `sku`, `description`; resposta deve confirmar o produto com `id` (ou `product.id` / `productId`).
- `GET /admin/lots` → lista JSON ou `{ "lots": [...] }`.
- `POST /admin/lots` → recebe `productId`, `code`, `quantity`, `manufacturedAt`, `expiresAt`; resposta deve confirmar o lote com `id` (ou `lot.id` / `lotId`).
- `POST /admin/lots/{id}/qrcodes` → recebe `{ "quantity": number }`; resposta `{ "codes": ["token", ...] }` ou códigos com campo `token`, `code`, `value` ou `url`. Os tokens devem ser criados/assinados pelo servidor; a interface apenas os renderiza como QR.
- `POST /auth/verify` → recebe `{ "token": "..." }`; somente resposta HTTP bem-sucedida com JSON `{ "ok": true }` permite exibir **PRODUTO ORIGINAL**. Para qualquer outro retorno, erro, resposta inválida ou falha de rede, a interface não confirma autenticidade.

Adapte os caminhos/campos à API real antes de integrar, se o backend usar outro contrato. Esta interface não substitui controles de acesso no servidor. Nenhum backend foi criado ou modificado por esta entrega.
