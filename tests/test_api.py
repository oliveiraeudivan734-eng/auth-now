import json
import tempfile
import threading
import unittest
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
from pathlib import Path

from api.server import Store, create_handler


class ApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.store = Store(Path(cls.temp.name) / "test.sqlite3")
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), create_handler(cls.store, "test-admin-secret"))
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.port = cls.server.server_address[1]

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()
        cls.temp.cleanup()

    def call(self, method, path, body=None, admin_token=None):
        connection = HTTPConnection("127.0.0.1", self.port, timeout=3)
        headers, encoded = {}, None
        if body is not None:
            encoded = json.dumps(body).encode("utf-8")
            headers["Content-Type"] = "application/json"
        if admin_token:
            headers["Authorization"] = f"Bearer {admin_token}"
        connection.request(method, path, body=encoded, headers=headers)
        response = connection.getresponse()
        payload = response.read()
        status = response.status
        connection.close()
        return status, json.loads(payload) if payload else {}

    def test_auth_product_lot_qr_verify_repeat_and_revoke_flow(self):
        status, _ = self.call("GET", "/admin/products")
        self.assertEqual(status, 401)
        status, product_payload = self.call("POST", "/admin/products", {"name": "Café especial", "category": "Alimentos", "brand": "Origem"}, "test-admin-secret")
        self.assertEqual(status, 201)
        product_id = product_payload["product"]["id"]
        status, lot_payload = self.call("POST", "/admin/lots", {"productId": product_id, "code": "LOT-001", "quantity": 2}, "test-admin-secret")
        self.assertEqual(status, 201)
        lot_id = lot_payload["lot"]["id"]
        status, issued = self.call("POST", f"/admin/lots/{lot_id}/qrcodes", {"quantity": 1}, "test-admin-secret")
        self.assertEqual(status, 201)
        code = issued["codes"][0]
        token = code["token"]
        self.assertEqual(len(token), 43)
        status, valid = self.call("POST", "/auth/verify", {"token": token})
        self.assertEqual(status, 200)
        self.assertTrue(valid["ok"])
        self.assertEqual(valid["product"]["name"], "Café especial")
        status, repeated = self.call("POST", "/auth/verify", {"token": token})
        self.assertTrue(repeated["ok"])
        self.assertTrue(repeated["consultation"]["possibleReuse"])
        self.assertIn("não significa", repeated["consultation"]["notice"])
        status, revoked = self.call("DELETE", f"/admin/codes/{code['id']}", admin_token="test-admin-secret")
        self.assertEqual(status, 200)
        status, result = self.call("POST", "/auth/verify", {"token": token})
        self.assertFalse(result["ok"])
        self.assertEqual(result["status"], "revoked")

    def test_validation_unknown_code_and_issue_limit(self):
        status, _ = self.call("POST", "/admin/products", {"name": "", "category": ""}, "test-admin-secret")
        self.assertEqual(status, 400)
        status, result = self.call("POST", "/auth/verify", {"token": "unknown-token"})
        self.assertEqual(status, 200)
        self.assertFalse(result["ok"])
        self.assertEqual(result["status"], "not_found")
        product = self.store.create_product({"name": "Produto", "category": "Teste"})
        lot = self.store.create_lot({"productId": product["id"], "code": "LOT-LIMIT", "quantity": 1})
        self.store.issue_codes(lot["id"], 1)
        with self.assertRaises(ValueError):
            self.store.issue_codes(lot["id"], 1)


if __name__ == "__main__":
    unittest.main()
