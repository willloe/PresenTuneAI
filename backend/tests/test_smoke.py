from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_health_ok():
    r = client.get("/v1/health")
    assert r.status_code == 200
    j = r.json()
    assert j.get("status") == "ok"
