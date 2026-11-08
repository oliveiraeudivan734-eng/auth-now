#!/usr/bin/env python3
"""AUTH-NOW development API backed by SQLite (Python standard library only).

This server is for local development and trusted-network testing, not production.
"""
from __future__ import annotations

import hashlib
import json
import os
import secrets
import sqlite3
import threading
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = Path(os.environ.get("AUTHNOW_DB", ROOT / "api" / "auth-now.sqlite3"))
ADMIN_TOKEN = os.environ.get("AUTHNOW_ADMIN_TOKEN", "")
MAX_BODY_BYTES = 64 * 1024


def timestamp() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def digest_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


class Store:
    def __init__(self, path: str | Path = DB_PATH):
        self.path = str(path)
        Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        self.initialize()

    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys = ON")
        return db

    def initialize(self):
        with self.connect() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS products (
                    id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL,
                    brand TEXT NOT NULL DEFAULT '', sku TEXT NOT NULL DEFAULT '',
                    description TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS lots (
                    id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id),
                    code TEXT NOT NULL UNIQUE, quantity INTEGER NOT NULL CHECK(quantity > 0),
                    manufactured_at TEXT NOT NULL DEFAULT '', expires_at TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS codes (
                    id TEXT PRIMARY KEY, lot_id TEXT NOT NULL REFERENCES lots(id),
                    token_hash TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'active',
                    created_at TEXT NOT NULL, revoked_at TEXT
                );
                CREATE TABLE IF NOT EXISTS consultations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT, code_id TEXT,
                    token_hash TEXT NOT NULL, consulted_at TEXT NOT NULL,
                    outcome TEXT NOT NULL, client_ip TEXT NOT NULL DEFAULT ''
                );
                CREATE INDEX IF NOT EXISTS consultations_by_code
                    ON consultations(code_id, consulted_at);
                CREATE INDEX IF NOT EXISTS consultations_by_hash
                    ON consultations(token_hash, consulted_at);
            """)

    def list_products(self):
        with self.connect() as db:
            return [dict(row) for row in db.execute(
                "SELECT id,name,category,brand,sku,description,created_at FROM products ORDER BY created_at DESC"
            )]

    def create_product(self, values):
        product_id = secrets.token_urlsafe(12)
        with self.connect() as db:
            db.execute("INSERT INTO products(id,name,category,brand,sku,description,created_at) VALUES(?,?,?,?,?,?,?)",
                       (product_id, values["name"], values["category"], values.get("brand", ""),
                        values.get("sku", ""), values.get("description", ""), timestamp()))
        return next(product for product in self.list_products() if product["id"] == product_id)

    def list_lots(self):
        with self.connect() as db:
            rows = db.execute("""SELECT l.id,l.product_id AS productId,l.code,l.quantity,
                l.manufactured_at AS manufacturedAt,l.expires_at AS expiresAt,
                l.created_at,p.name AS productName FROM lots l JOIN products p ON p.id=l.product_id
                ORDER BY l.created_at DESC""").fetchall()
            return [dict(row) for row in rows]

    def create_lot(self, values):
        lot_id = secrets.token_urlsafe(12)
        with self.connect() as db:
            if not db.execute("SELECT 1 FROM products WHERE id=?", (values["productId"],)).fetchone():
                raise LookupError("Produto não encontrado.")
            db.execute("INSERT INTO lots(id,product_id,code,quantity,manufactured_at,expires_at,created_at) VALUES(?,?,?,?,?,?,?)",
                       (lot_id, values["productId"], values["code"], values["quantity"],
                        values.get("manufacturedAt", ""), values.get("expiresAt", ""), timestamp()))
        return next(lot for lot in self.list_lots() if lot["id"] == lot_id)

    def issue_codes(self, lot_id, quantity):
        codes = []
        with self.connect() as db:
            lot = db.execute("SELECT quantity FROM lots WHERE id=?", (lot_id,)).fetchone()
            if lot is None:
                raise LookupError("Lote não encontrado.")
            already_issued = db.execute("SELECT COUNT(*) AS n FROM codes WHERE lot_id=?", (lot_id,)).fetchone()["n"]
            if already_issued + quantity > lot["quantity"]:
                raise ValueError("A quantidade excede as unidades restantes neste lote.")
            for _ in range(quantity):
                token = secrets.token_urlsafe(32)
                code_id = secrets.token_urlsafe(12)
                db.execute("INSERT INTO codes(id,lot_id,token_hash,created_at) VALUES(?,?,?,?)",
                           (code_id, lot_id, digest_token(token), timestamp()))
                codes.append({"id": code_id, "token": token})
        return codes

    def verify(self, token, client_ip=""):
        token_digest = digest_token(token)
        with self.connect() as db:
            code = db.execute("""SELECT c.id,c.status,l.code AS lot_code,l.manufactured_at,l.expires_at,
                p.name,p.category,p.brand,p.sku,p.description FROM codes c
                JOIN lots l ON l.id=c.lot_id JOIN products p ON p.id=l.product_id
                WHERE c.token_hash=?""", (token_digest,)).fetchone()
            if code is None:
                db.execute("INSERT INTO consultations(token_hash,consulted_at,outcome,client_ip) VALUES(?,?,?,?)",
                           (token_digest, timestamp(), "not_found", client_ip))
                return {"ok": False, "status": "not_found", "message": "Código não encontrado. Não foi possível confirmar a autenticidade."}
            previous = db.execute("SELECT COUNT(*) AS n FROM consultations WHERE code_id=? AND outcome='valid'",
                                  (code["id"],)).fetchone()["n"]
            outcome = "revoked" if code["status"] != "active" else "valid"
            db.execute("INSERT INTO consultations(code_id,token_hash,consulted_at,outcome,client_ip) VALUES(?,?,?,?,?)",
                       (code["id"], token_digest, timestamp(), outcome, client_ip))
            if outcome == "revoked":
                return {"ok": False, "status": "revoked", "message": "Este código foi revogado. Não foi possível confirmar a autenticidade."}
            reuse_notice = ("Este código já foi consultado anteriormente. Reutilizações podem ocorrer legitimamente; "
                            "isso não significa, por si só, falsificação.") if previous else None
            return {"ok": True, "status": "valid", "message": "Autenticidade confirmada pelo servidor AUTH-NOW.",
                    "product": {"name": code["name"], "category": code["category"], "brand": code["brand"],
                                "sku": code["sku"], "description": code["description"], "lotCode": code["lot_code"],
                                "manufacturedAt": code["manufactured_at"], "expiresAt": code["expires_at"]},
                    "consultation": {"previousValidConsultations": previous, "possibleReuse": previous > 0,
                                     "notice": reuse_notice}}

    def revoke_code(self, code_id):
        with self.connect() as db:
            cursor = db.execute("UPDATE codes SET status='revoked',revoked_at=? WHERE id=? AND status='active'",
                                (timestamp(), code_id))
            return cursor.rowcount > 0


def create_handler(store: Store, admin_token: str):
    class Handler(BaseHTTPRequestHandler):
        server_version = "AUTH-NOW-Dev/1.0"

        def log_message(self, fmt, *args):
            print("%s - %s" % (self.address_string(), fmt % args))

        def send_json(self, status, payload):
            raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(raw)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            if status != 204:
                self.wfile.write(raw)

        def do_OPTIONS(self):
            self.send_json(204, {})

        def read_body(self):
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if length <= 0 or length > MAX_BODY_BYTES:
                    raise ValueError
                payload = json.loads(self.rfile.read(length))
                if not isinstance(payload, dict):
                    raise ValueError
                return payload
            except (ValueError, json.JSONDecodeError, UnicodeDecodeError) as exc:
                raise ValueError("JSON inválido ou tamanho de requisição inválido.") from exc

        def authorized(self):
            supplied = self.headers.get("Authorization", "")
            return bool(admin_token) and secrets.compare_digest(supplied, "Bearer " + admin_token)

        def require_admin(self):
            if not self.authorized():
                self.send_json(401, {"message": "Autenticação administrativa necessária."})
                return False
            return True

        def do_GET(self):
            path = urlparse(self.path).path
            if path == "/health":
                return self.send_json(200, {"ok": True, "service": "AUTH-NOW development API"})
            if path in ("/admin/products", "/admin/lots"):
                if not self.require_admin():
                    return
                key, value = ("products", store.list_products()) if path.endswith("products") else ("lots", store.list_lots())
                return self.send_json(200, {key: value})
            return self.send_json(404, {"message": "Rota não encontrada."})

        def do_POST(self):
            path = urlparse(self.path).path
            try:
                data = self.read_body()
                if path == "/auth/verify":
                    token = data.get("token")
                    if not isinstance(token, str) or not token.strip() or len(token) > 512:
                        return self.send_json(400, {"ok": False, "status": "invalid_request", "message": "Informe um código válido."})
                    return self.send_json(200, store.verify(token.strip(), self.client_address[0]))
                if not self.require_admin():
                    return
                if path == "/admin/products":
                    name, category = data.get("name"), data.get("category")
                    if not isinstance(name, str) or not name.strip() or len(name) > 120 or not isinstance(category, str) or not category.strip() or len(category) > 80:
                        return self.send_json(400, {"message": "Nome e categoria são obrigatórios (máximo 120 e 80 caracteres)."})
                    for field, max_length in (("brand", 80), ("sku", 80), ("description", 500)):
                        if not isinstance(data.get(field, ""), str) or len(data.get(field, "")) > max_length:
                            return self.send_json(400, {"message": f"Campo {field} inválido."})
                    product = store.create_product({**data, "name": name.strip(), "category": category.strip()})
                    return self.send_json(201, {"product": product})
                if path == "/admin/lots":
                    product_id, code, quantity = data.get("productId"), data.get("code"), data.get("quantity")
                    if not isinstance(product_id, str) or not product_id or not isinstance(code, str) or not code.strip() or len(code) > 100 or type(quantity) is not int or not 1 <= quantity <= 100000:
                        return self.send_json(400, {"message": "Produto, código do lote e quantidade inteira entre 1 e 100000 são obrigatórios."})
                    for field in ("manufacturedAt", "expiresAt"):
                        if not isinstance(data.get(field, ""), str) or len(data.get(field, "")) > 32:
                            return self.send_json(400, {"message": f"Campo {field} inválido."})
                    lot = store.create_lot({**data, "code": code.strip()})
                    return self.send_json(201, {"lot": lot})
                parts = path.strip("/").split("/")
                if len(parts) == 4 and parts[:2] == ["admin", "lots"] and parts[3] == "qrcodes":
                    quantity = data.get("quantity")
                    if type(quantity) is not int or not 1 <= quantity <= 1000:
                        return self.send_json(400, {"message": "Quantidade deve ser um inteiro entre 1 e 1000."})
                    return self.send_json(201, {"codes": store.issue_codes(unquote(parts[2]), quantity)})
                return self.send_json(404, {"message": "Rota não encontrada."})
            except ValueError as exc:
                return self.send_json(400, {"message": str(exc)})
            except LookupError as exc:
                return self.send_json(404, {"message": str(exc)})
            except sqlite3.IntegrityError:
                return self.send_json(409, {"message": "Registro duplicado ou relacionado a recurso inexistente."})

        def do_DELETE(self):
            parts = urlparse(self.path).path.strip("/").split("/")
            if len(parts) != 3 or parts[:2] != ["admin", "codes"]:
                return self.send_json(404, {"message": "Rota não encontrada."})
            if not self.require_admin():
                return
            if not store.revoke_code(unquote(parts[2])):
                return self.send_json(404, {"message": "Código ativo não encontrado."})
            return self.send_json(200, {"ok": True, "status": "revoked"})

    return Handler


def create_server(host="127.0.0.1", port=8080, db_path=DB_PATH, admin_token=ADMIN_TOKEN):
    if not admin_token:
        raise RuntimeError("Defina AUTHNOW_ADMIN_TOKEN com uma senha longa antes de iniciar a API.")
    return ThreadingHTTPServer((host, port), create_handler(Store(db_path), admin_token))


if __name__ == "__main__":
    bind_host = os.environ.get("AUTHNOW_HOST", "0.0.0.0")
    bind_port = int(os.environ.get("AUTHNOW_PORT", "8080"))
    server = create_server(bind_host, bind_port)
    print(f"API de desenvolvimento AUTH-NOW em http://{bind_host}:{bind_port}; banco: {DB_PATH}")
    print("Somente para testes em rede confiável. Encerre com Ctrl+C.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nEncerrando API.")
    finally:
        server.server_close()
