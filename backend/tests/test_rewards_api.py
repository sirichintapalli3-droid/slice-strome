"""API coverage for level rewards, wallet accounting, and house construction."""

import os
import uuid
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TEST_DB_NAME = f"slice_storm_api_test_{uuid.uuid4().hex}.db"
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB_NAME}"
os.environ["JWT_SECRET_KEY"] = "api-test-only-secret"

from backend.app import DB, app  # noqa: E402


class RewardsApiTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        app.config.update(TESTING=True)
        cls.client = app.test_client()
        cls.db_path = Path(app.instance_path) / TEST_DB_NAME

    @classmethod
    def tearDownClass(cls):
        with app.app_context():
            DB.session.remove()
            DB.engine.dispose()
        cls.db_path.unlink(missing_ok=True)

    def setUp(self):
        with app.app_context():
            DB.drop_all()
            DB.create_all()
        self.client = app.test_client()
        response = self.client.post("/api/auth/register", json={
            "name": "Gem Tester",
            "email": f"{uuid.uuid4().hex}@example.test",
            "password": "test-pass-123",
        })
        self.assertEqual(response.status_code, 201, response.get_json())
        self.headers = {"Authorization": f"Bearer {response.get_json()['token']}"}

    def start_level(self, level):
        response = self.client.post("/api/games/start", headers=self.headers, json={"mode": "classic", "level": level})
        self.assertEqual(response.status_code, 201, response.get_json())
        return response.get_json()["session"]["id"]

    def complete_level(self, level, session_id, score, fruits):
        return self.client.post("/api/progress/complete", headers=self.headers, json={
            "level": level,
            "sessionId": session_id,
            "levelScore": score,
            "fruitsSliced": fruits,
        })

    def claim(self, level):
        return self.client.post("/api/rewards/claim", headers=self.headers, json={"level": level})

    def test_claim_reward_and_build_with_persisted_wallet(self):
        session_1 = self.start_level(1)
        insufficient_fruits = self.complete_level(1, session_1, 100, 4)
        self.assertEqual(insufficient_fruits.status_code, 409)

        completed_1 = self.complete_level(1, session_1, 100, 5)
        self.assertEqual(completed_1.status_code, 200, completed_1.get_json())
        self.assertEqual(completed_1.get_json()["reward"], {"level": 1, "gems": 50, "claimed": False})
        self.assertEqual(self.claim(1).status_code, 201)

        wallet = self.client.get("/api/wallet", headers=self.headers).get_json()
        self.assertEqual(wallet["balance"], 50)
        self.assertEqual(wallet["totalEarned"], 50)
        self.assertEqual(self.claim(1).status_code, 409)
        self.assertEqual(self.client.get("/api/wallet", headers=self.headers).get_json()["balance"], 50)

        skipped_build = self.client.post("/api/house/build", headers=self.headers, json={"step": 2})
        self.assertEqual(skipped_build.status_code, 409)
        final_step_locked = self.client.post("/api/house/build", headers=self.headers, json={"step": 100})
        self.assertEqual(final_step_locked.status_code, 409)
        self.assertEqual(self.client.get("/api/wallet", headers=self.headers).get_json()["balance"], 50)

        advanced = self.client.put("/api/progress", headers=self.headers, json={"currentLevel": 2})
        self.assertEqual(advanced.status_code, 200, advanced.get_json())
        session_2 = self.start_level(2)
        completed_2 = self.complete_level(2, session_2, 175, 7)
        self.assertEqual(completed_2.status_code, 200, completed_2.get_json())
        self.assertEqual(completed_2.get_json()["reward"]["gems"], 75)
        self.assertEqual(self.claim(2).status_code, 201)

        built = self.client.post("/api/house/build", headers=self.headers, json={"step": 1})
        self.assertEqual(built.status_code, 201, built.get_json())
        self.assertEqual(built.get_json()["gems"], 105)
        duplicate_build = self.client.post("/api/house/build", headers=self.headers, json={"step": 1})
        self.assertEqual(duplicate_build.status_code, 409)
        second_step = self.client.post("/api/house/build", headers=self.headers, json={"step": 2})
        self.assertEqual(second_step.status_code, 201, second_step.get_json())
        self.assertEqual(second_step.get_json()["gems"], 85)

        wallet = self.client.get("/api/wallet", headers=self.headers).get_json()
        house = self.client.get("/api/house", headers=self.headers).get_json()
        self.assertEqual((wallet["balance"], wallet["totalEarned"], wallet["totalSpent"]), (85, 125, 40))
        self.assertEqual(house["level"], 2)
        self.assertEqual(house["step"], 2)
        self.assertEqual(len(house["stages"]), 100)
        self.assertTrue(house["stages"][0]["complete"])
        self.assertTrue(house["stages"][2]["available"])

    def test_failed_level_does_not_reward_and_can_be_retried(self):
        session_id = self.start_level(1)
        response = self.complete_level(1, session_id, 99, 5)
        self.assertEqual(response.status_code, 409)
        self.assertEqual(self.client.get("/api/wallet", headers=self.headers).get_json()["balance"], 0)

        lost = self.client.post("/api/games/complete", headers=self.headers, json={"gameId": session_id, "score": 80, "fruitsSliced": 4})
        self.assertEqual(lost.status_code, 201, lost.get_json())
        retry_session = self.start_level(1)
        self.assertNotEqual(retry_session, session_id)
        progress = self.client.get("/api/progress", headers=self.headers).get_json()["progress"]
        self.assertEqual(progress["currentLevel"], 1)
        self.assertFalse(progress["levelComplete"])


if __name__ == "__main__":
    unittest.main()
