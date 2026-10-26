import json
import os
import secrets
from datetime import datetime, timedelta

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from flask_jwt_extended import JWTManager, create_access_token, get_jwt_identity, jwt_required
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import inspect, or_, text
from sqlalchemy.exc import IntegrityError
from werkzeug.security import check_password_hash, generate_password_hash

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRONTEND_BUILD = os.path.join(PROJECT_ROOT, 'frontend', 'client', 'dist')
app = Flask(
    __name__,
    static_folder=os.path.join(PROJECT_ROOT, 'frontend', 'static'),
    instance_path=os.path.join(PROJECT_ROOT, 'instance'),
)
os.makedirs(app.instance_path, exist_ok=True)
database_url = os.getenv('DATABASE_URL')
if not database_url:
    if os.getenv('VERCEL'):
        raise RuntimeError('Set DATABASE_URL to a persistent PostgreSQL database in the Vercel project environment.')
    database_url = 'sqlite:///slice_storm_merged.db'
if database_url.startswith('postgres://'):
    database_url = 'postgresql+psycopg://' + database_url.removeprefix('postgres://')
elif database_url.startswith('postgresql://'):
    database_url = 'postgresql+psycopg://' + database_url.removeprefix('postgresql://')
app.config['SQLALCHEMY_DATABASE_URI'] = database_url
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
jwt_secret_key = os.getenv('JWT_SECRET_KEY')
if not jwt_secret_key:
    if os.getenv('VERCEL'):
        raise RuntimeError('Set JWT_SECRET_KEY in the Vercel project environment.')
    jwt_secret_key = 'slice-storm-secret-key'
app.config['JWT_SECRET_KEY'] = jwt_secret_key
with open(os.path.join(os.path.dirname(__file__), 'level_config.json'), encoding='utf-8') as level_file:
    LEVEL_CONFIG = json.load(level_file)
with open(os.path.join(os.path.dirname(__file__), 'house_construction_steps.json'), encoding='utf-8') as house_steps_file:
    HOUSE_CONSTRUCTION_STEPS = json.load(house_steps_file)
HOUSE_STEP_BY_ID = {f"construction-step-{item['step']}": item for item in HOUSE_CONSTRUCTION_STEPS}
MAX_LEVEL = len(LEVEL_CONFIG)

DB = SQLAlchemy(app)
JWT = JWTManager(app)
allowed_origins = [
    origin.strip().rstrip('/')
    for origin in os.getenv('CORS_ALLOWED_ORIGINS', 'https://slice-strome.vercel.app').split(',')
    if origin.strip()
]
CORS(app, resources={r'/api/*': {'origins': allowed_origins}})

class User(DB.Model):
    id = DB.Column(DB.Integer, primary_key=True)
    name = DB.Column(DB.String(80), nullable=False)
    email = DB.Column(DB.String(120), unique=True, nullable=False)
    password_hash = DB.Column(DB.String(255), nullable=False)
    highest_score = DB.Column(DB.Integer, default=0)
    total_games = DB.Column(DB.Integer, default=0)
    total_fruits_sliced = DB.Column(DB.Integer, default=0)
    highest_combo = DB.Column(DB.Integer, default=0)
    created_at = DB.Column(DB.DateTime, default=datetime.utcnow)

    def to_public_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'email': self.email,
            'username': self.name,
            'highestScore': self.highest_score,
            'totalGames': self.total_games,
            'totalFruitsSliced': self.total_fruits_sliced,
            'highestCombo': self.highest_combo,
            'createdAt': self.created_at.isoformat()
        }


class GameResult(DB.Model):
    id = DB.Column(DB.Integer, primary_key=True)
    user_id = DB.Column(DB.Integer, DB.ForeignKey('user.id'))
    session_id = DB.Column(DB.String(80), unique=True, nullable=False)
    level = DB.Column(DB.Integer, default=1, nullable=False)
    mode = DB.Column(DB.String(30), default='classic')
    score = DB.Column(DB.Integer, default=0)
    fruits_sliced = DB.Column(DB.Integer, default=0)
    bombs_hit = DB.Column(DB.Integer, default=0)
    max_combo = DB.Column(DB.Integer, default=0)
    duration = DB.Column(DB.Float, default=0.0)
    accuracy = DB.Column(DB.Float, default=0.0)
    status = DB.Column(DB.String(30), default='completed')
    created_at = DB.Column(DB.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'userId': self.user_id,
            'sessionId': self.session_id,
            'level': self.level,
            'mode': self.mode,
            'score': self.score,
            'fruitsSliced': self.fruits_sliced,
            'bombsHit': self.bombs_hit,
            'maxCombo': self.max_combo,
            'duration': self.duration,
            'accuracy': self.accuracy,
            'status': self.status,
            'createdAt': self.created_at.isoformat()
        }


class GameSession(DB.Model):
    id = DB.Column(DB.Integer, primary_key=True)
    session_id = DB.Column(DB.String(80), unique=True, nullable=False)
    user_id = DB.Column(DB.Integer, DB.ForeignKey('user.id'), nullable=True)
    level = DB.Column(DB.Integer, default=1, nullable=False)
    mode = DB.Column(DB.String(30), default='classic', nullable=False)
    challenge_code = DB.Column(DB.String(12), nullable=True)
    status = DB.Column(DB.String(30), default='active', nullable=False)
    created_at = DB.Column(DB.DateTime, default=datetime.utcnow, nullable=False)


class PlayerProgress(DB.Model):
    id = DB.Column(DB.Integer, primary_key=True)
    user_id = DB.Column(DB.Integer, DB.ForeignKey('user.id'), unique=True, nullable=False)
    current_level = DB.Column(DB.Integer, default=1, nullable=False)
    unlocked_level = DB.Column(DB.Integer, default=1, nullable=False)
    level_score = DB.Column(DB.Integer, default=0, nullable=False)
    fruits_sliced = DB.Column(DB.Integer, default=0, nullable=False)
    level_complete = DB.Column(DB.Boolean, default=False, nullable=False)
    updated_at = DB.Column(DB.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'currentLevel': self.current_level,
            'unlockedLevel': self.unlocked_level,
            'levelScore': self.level_score,
            'fruitsSliced': self.fruits_sliced,
            'levelComplete': self.level_complete,
            'updatedAt': self.updated_at.isoformat() if self.updated_at else None
        }


class GiftClaim(DB.Model):
    id = DB.Column(DB.Integer, primary_key=True)
    user_id = DB.Column(DB.Integer, DB.ForeignKey('user.id'), nullable=False)
    gift_id = DB.Column(DB.String(40), nullable=False)
    gems = DB.Column(DB.Integer, nullable=False)
    claimed_at = DB.Column(DB.DateTime, default=datetime.utcnow, nullable=False)
    __table_args__ = (DB.UniqueConstraint('user_id', 'gift_id', name='uq_gift_claim_user_gift'),)


class DailyGiftClaim(DB.Model):
    id = DB.Column(DB.Integer, primary_key=True)
    user_id = DB.Column(DB.Integer, DB.ForeignKey('user.id'), nullable=False)
    claim_day = DB.Column(DB.String(10), nullable=False)
    gems = DB.Column(DB.Integer, nullable=False, default=10)
    __table_args__ = (DB.UniqueConstraint('user_id', 'claim_day', name='uq_daily_gift_user_day'),)


class LevelGemReward(DB.Model):
    id = DB.Column(DB.Integer, primary_key=True)
    user_id = DB.Column(DB.Integer, DB.ForeignKey('user.id'), nullable=False)
    level = DB.Column(DB.Integer, nullable=False)
    gems = DB.Column(DB.Integer, nullable=False, default=20)
    claimed = DB.Column(DB.Boolean, nullable=False, default=True)
    claimed_at = DB.Column(DB.DateTime, nullable=True)
    __table_args__ = (DB.UniqueConstraint('user_id', 'level', name='uq_level_gem_user_level'),)


class GemPurchase(DB.Model):
    id = DB.Column(DB.Integer, primary_key=True)
    user_id = DB.Column(DB.Integer, DB.ForeignKey('user.id'), nullable=False)
    item_id = DB.Column(DB.String(40), nullable=False)
    cost = DB.Column(DB.Integer, nullable=False)
    purchased_at = DB.Column(DB.DateTime, default=datetime.utcnow, nullable=False)
    __table_args__ = (DB.UniqueConstraint('user_id', 'item_id', name='uq_house_item_user_item'),)


class HouseConstructionStep(DB.Model):
    id = DB.Column(DB.Integer, primary_key=True)
    user_id = DB.Column(DB.Integer, DB.ForeignKey('user.id'), nullable=False)
    step = DB.Column(DB.Integer, nullable=False)
    cost = DB.Column(DB.Integer, nullable=False)
    completed_at = DB.Column(DB.DateTime, nullable=False, default=datetime.utcnow)
    __table_args__ = (DB.UniqueConstraint('user_id', 'step', name='uq_house_construction_user_step'),)


class GemTransaction(DB.Model):
    id = DB.Column(DB.Integer, primary_key=True)
    user_id = DB.Column(DB.Integer, DB.ForeignKey('user.id'), nullable=False, index=True)
    amount = DB.Column(DB.Integer, nullable=False)
    kind = DB.Column(DB.String(24), nullable=False)
    description = DB.Column(DB.String(120), nullable=False)
    source_key = DB.Column(DB.String(100), nullable=False)
    created_at = DB.Column(DB.DateTime, nullable=False, default=datetime.utcnow)
    __table_args__ = (DB.UniqueConstraint('user_id', 'source_key', name='uq_gem_tx_user_source'),)


class LiveRoom(DB.Model):
    id = DB.Column(DB.Integer, primary_key=True)
    owner_id = DB.Column(DB.Integer, DB.ForeignKey('user.id'), nullable=False)
    title = DB.Column(DB.String(80), nullable=False, default='Live gameplay')
    active = DB.Column(DB.Boolean, nullable=False, default=True)
    created_at = DB.Column(DB.DateTime, nullable=False, default=datetime.utcnow)


class LiveViewer(DB.Model):
    id = DB.Column(DB.Integer, primary_key=True)
    room_id = DB.Column(DB.Integer, DB.ForeignKey('live_room.id'), nullable=False)
    user_id = DB.Column(DB.Integer, DB.ForeignKey('user.id'), nullable=False)
    joined_at = DB.Column(DB.DateTime, nullable=False, default=datetime.utcnow)
    __table_args__ = (DB.UniqueConstraint('room_id', 'user_id', name='uq_live_viewer_room_user'),)


class LiveSignal(DB.Model):
    id = DB.Column(DB.Integer, primary_key=True)
    room_id = DB.Column(DB.Integer, DB.ForeignKey('live_room.id'), nullable=False)
    viewer_id = DB.Column(DB.Integer, DB.ForeignKey('live_viewer.id'), nullable=False)
    sender_role = DB.Column(DB.String(10), nullable=False)
    payload = DB.Column(DB.Text, nullable=False)
    created_at = DB.Column(DB.DateTime, nullable=False, default=datetime.utcnow)


HOUSE_CATALOG = [
    {'id': 'plant', 'name': 'Berry planter', 'icon': '🪴', 'cost': 15},
    {'id': 'lamp', 'name': 'Sunset lamp', 'icon': '🛋️', 'cost': 25},
    {'id': 'window', 'name': 'Garden window', 'icon': '🪟', 'cost': 35},
    {'id': 'roof', 'name': 'Watermelon roof', 'icon': '🏠', 'cost': 60},
    {'id': 'house-level-1', 'name': 'Foundation', 'icon': '🧱', 'cost': 100},
    {'id': 'house-level-2', 'name': 'Walls', 'icon': '🧱', 'cost': 200},
    {'id': 'house-level-3', 'name': 'Doors and windows', 'icon': '🚪', 'cost': 150},
    {'id': 'house-level-4', 'name': 'Roof', 'icon': '🏠', 'cost': 250},
    {'id': 'house-level-5', 'name': 'Painting and finishing', 'icon': '🖌️', 'cost': 100},
    {'id': 'house-level-6', 'name': 'Garden and decorations', 'icon': '🌳', 'cost': 200},
]
HOUSE_BUILD_LEVELS = [f'house-level-{level}' for level in range(1, 7)]


class FriendChallenge(DB.Model):
    id = DB.Column(DB.Integer, primary_key=True)
    code = DB.Column(DB.String(12), unique=True, nullable=False, index=True)
    creator_id = DB.Column(DB.Integer, DB.ForeignKey('user.id'), nullable=False)
    opponent_id = DB.Column(DB.Integer, DB.ForeignKey('user.id'), nullable=True)
    creator_score = DB.Column(DB.Integer, nullable=True)
    opponent_score = DB.Column(DB.Integer, nullable=True)
    status = DB.Column(DB.String(20), default='waiting', nullable=False)
    created_at = DB.Column(DB.DateTime, default=datetime.utcnow, nullable=False)


with app.app_context():
    DB.create_all()
    if 'level' not in {column['name'] for column in inspect(DB.engine).get_columns('game_result')}:
        DB.session.execute(text('ALTER TABLE game_result ADD COLUMN level INTEGER NOT NULL DEFAULT 1'))
        DB.session.commit()
    if 'challenge_code' not in {column['name'] for column in inspect(DB.engine).get_columns('game_session')}:
        DB.session.execute(text('ALTER TABLE game_session ADD COLUMN challenge_code VARCHAR(12)'))
        DB.session.commit()
    if 'claimed' not in {column['name'] for column in inspect(DB.engine).get_columns('level_gem_reward')}:
        DB.session.execute(text('ALTER TABLE level_gem_reward ADD COLUMN claimed BOOLEAN NOT NULL DEFAULT TRUE'))
    if 'claimed_at' not in {column['name'] for column in inspect(DB.engine).get_columns('level_gem_reward')}:
        DB.session.execute(text('ALTER TABLE level_gem_reward ADD COLUMN claimed_at TIMESTAMP'))
    DB.session.commit()
    existing_sources = {(item.user_id, item.source_key) for item in GemTransaction.query.with_entities(GemTransaction.user_id, GemTransaction.source_key).all()}
    for claim in GiftClaim.query.all():
        key = f'legacy-gift-{claim.id}'
        if (claim.user_id, key) not in existing_sources:
            DB.session.add(GemTransaction(user_id=claim.user_id, amount=claim.gems, kind='gift', description='Achievement gift', source_key=key))
    for claim in DailyGiftClaim.query.all():
        key = f'legacy-daily-{claim.id}'
        if (claim.user_id, key) not in existing_sources:
            DB.session.add(GemTransaction(user_id=claim.user_id, amount=claim.gems, kind='daily', description='Daily gift', source_key=key))
    for reward in LevelGemReward.query.filter_by(claimed=True).all():
        key = f'level-reward-{reward.level}'
        if (reward.user_id, key) not in existing_sources:
            DB.session.add(GemTransaction(user_id=reward.user_id, amount=reward.gems, kind='level_reward', description=f'Level {reward.level} reward', source_key=key))
    for purchase in GemPurchase.query.all():
        key = f'legacy-purchase-{purchase.id}'
        if (purchase.user_id, key) not in existing_sources:
            DB.session.add(GemTransaction(user_id=purchase.user_id, amount=-purchase.cost, kind='house', description='House item purchase', source_key=key))
    DB.session.commit()


def wallet_balance(user_id):
    return DB.session.query(DB.func.coalesce(DB.func.sum(GemTransaction.amount), 0)).filter_by(user_id=user_id).scalar() or 0


def wallet_summary(user_id):
    transactions = GemTransaction.query.filter_by(user_id=user_id).order_by(GemTransaction.created_at.desc(), GemTransaction.id.desc()).all()
    earned = sum(max(0, item.amount) for item in transactions)
    spent = sum(abs(min(0, item.amount)) for item in transactions)
    return {
        'balance': earned - spent,
        'totalEarned': earned,
        'totalSpent': spent,
        'transactions': [
            {'id': item.id, 'amount': item.amount, 'kind': item.kind, 'description': item.description, 'createdAt': item.created_at.isoformat()}
            for item in transactions[:25]
        ]
    }


@app.get('/')
def index():
    client_build = FRONTEND_BUILD
    if not os.path.isfile(os.path.join(client_build, 'index.html')):
        return jsonify({'message': 'React client is not built. Run npm run client for development or npm run build first.'}), 503
    return send_from_directory(client_build, 'index.html')


@app.get('/assets/<path:filename>')
def client_asset(filename):
    return send_from_directory(os.path.join(FRONTEND_BUILD, 'assets'), filename)


@app.get('/<path:filename>')
def client_public_asset(filename):
    return send_from_directory(FRONTEND_BUILD, filename)


@app.get('/api/health')
def health():
    try:
        DB.session.execute(text('SELECT 1'))
    except Exception:
        DB.session.rollback()
        app.logger.exception('Database health check failed')
        return jsonify({'status': 'error', 'database': 'unavailable'}), 503
    return jsonify({'status': 'ok', 'database': 'connected', 'message': 'SLICE STORM backend is running'}), 200


@app.post('/api/auth/register')
def register_user():
    data = request.get_json(silent=True) or {}
    name = (data.get('name') or '').strip()
    email = (data.get('email') or '').strip().lower()
    password = data.get('password') or ''

    if not name or not email or len(password) < 6:
        return jsonify({'message': 'Name, valid email, and at least 6-character password are required'}), 400

    if User.query.filter_by(email=email).first():
        return jsonify({'message': 'This email is already registered'}), 409

    user = User(name=name, email=email, password_hash=generate_password_hash(password))
    DB.session.add(user)
    DB.session.commit()

    access_token = create_access_token(identity=str(user.id))
    return jsonify({'token': access_token, 'user': user.to_public_dict()}), 201


@app.post('/api/auth/login')
def login_user():
    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip().lower()
    password = data.get('password') or ''

    user = User.query.filter_by(email=email).first()
    if not user or not check_password_hash(user.password_hash, password):
        return jsonify({'message': 'Invalid credentials'}), 401

    access_token = create_access_token(identity=str(user.id))
    return jsonify({'token': access_token, 'user': user.to_public_dict()}), 200


@app.get('/api/auth/me')
@jwt_required()
def get_current_user():
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user:
        return jsonify({'message': 'User not found'}), 404
    return jsonify({'user': user.to_public_dict()}), 200


@app.put('/api/auth/me')
@jwt_required()
def update_current_user():
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    data = request.get_json(silent=True) or {}
    name = (data.get('name') or '').strip()
    email = (data.get('email') or '').strip().lower()
    if not name or len(name) > 80 or not email or len(email) > 120 or '@' not in email:
        return jsonify({'message': 'A valid name and email are required'}), 400
    duplicate = User.query.filter(User.email == email, User.id != user_id).first()
    if duplicate:
        return jsonify({'message': 'This email is already registered'}), 409
    user.name = name
    user.email = email
    DB.session.commit()
    return jsonify({'user': user.to_public_dict()}), 200


ACHIEVEMENT_CATALOG = [
    {'id': 'first-slice', 'name': 'First Slice', 'description': 'Slice your first fruit', 'icon': '🍓', 'metric': 'fruits', 'target': 1},
    {'id': 'fruit-rookie', 'name': 'Fruit Rookie', 'description': 'Slice 25 fruits', 'icon': '🍊', 'metric': 'fruits', 'target': 25},
    {'id': 'combo-master', 'name': 'Combo Master', 'description': 'Reach a combo of 10', 'icon': '⚡', 'metric': 'combo', 'target': 10},
    {'id': 'level-champion', 'name': 'Level Champion', 'description': 'Complete 5 levels', 'icon': '🏆', 'metric': 'levels', 'target': 5},
    {'id': 'fruit-legend', 'name': 'Fruit Legend', 'description': 'Slice 500 fruits', 'icon': '👑', 'metric': 'fruits', 'target': 500},
    {'id': 'score-spark', 'name': 'Score Spark', 'description': 'Score 1,000 points in one round', 'icon': '✨', 'metric': 'score', 'target': 1000},
    {'id': 'combo-comet', 'name': 'Combo Comet', 'description': 'Reach a combo of 20', 'icon': '☄️', 'metric': 'combo', 'target': 20},
    {'id': 'regular-slicer', 'name': 'Regular Slicer', 'description': 'Finish 10 rounds', 'icon': '🎮', 'metric': 'games', 'target': 10}
]

GIFT_CATALOG = [
    {'id': 'welcome-gift', 'achievementId': 'first-slice', 'name': 'Welcome Berry Box', 'icon': '🎁', 'gems': 10},
    {'id': 'rookie-gift', 'achievementId': 'fruit-rookie', 'name': 'Citrus Starter Pack', 'icon': '🍊', 'gems': 25},
    {'id': 'combo-gift', 'achievementId': 'combo-master', 'name': 'Combo Spark Chest', 'icon': '✨', 'gems': 50},
    {'id': 'champion-gift', 'achievementId': 'level-champion', 'name': 'Champion Crown', 'icon': '👑', 'gems': 100},
    {'id': 'legend-gift', 'achievementId': 'fruit-legend', 'name': 'Legendary Fruit Crate', 'icon': '💎', 'gems': 250}
]


def get_achievement_state(user, progress, games):
    metrics = {
        'fruits': user.total_fruits_sliced or 0,
        'combo': user.highest_combo or 0,
        'levels': max(0, progress.unlocked_level - 1),
        'score': user.highest_score or 0,
        'games': user.total_games or 0
    }
    state = []
    for achievement in ACHIEVEMENT_CATALOG:
        current = metrics[achievement['metric']]
        state.append({
            **achievement,
            'progress': min(current, achievement['target']),
            'unlocked': current >= achievement['target']
        })
    return state


def challenge_to_dict(challenge, user_id):
    creator = User.query.get(challenge.creator_id)
    opponent = User.query.get(challenge.opponent_id) if challenge.opponent_id else None
    winner = None
    if challenge.status == 'completed':
        if challenge.creator_score > challenge.opponent_score:
            winner = creator.name if creator else 'Player 1'
        elif challenge.opponent_score > challenge.creator_score:
            winner = opponent.name if opponent else 'Player 2'
        else:
            winner = 'Tie'
    return {
        'code': challenge.code,
        'creatorName': creator.name if creator else 'Player 1',
        'opponentName': opponent.name if opponent else None,
        'creatorScore': challenge.creator_score,
        'opponentScore': challenge.opponent_score,
        'status': challenge.status,
        'winner': winner,
        'isCreator': challenge.creator_id == user_id,
        'createdAt': challenge.created_at.isoformat()
    }


@app.get('/api/profile')
@jwt_required()
def get_player_profile():
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user:
        return jsonify({'message': 'User not found'}), 404
    progress = get_or_create_progress(user_id)
    games = GameResult.query.filter_by(user_id=user_id).order_by(GameResult.created_at.desc()).all()
    sliced = user.total_fruits_sliced or 0
    best_combo = user.highest_combo or 0
    completed_levels = max(0, progress.unlocked_level - 1)
    achievements = get_achievement_state(user, progress, games)
    claimed_gifts = {claim.gift_id: claim for claim in GiftClaim.query.filter_by(user_id=user_id).all()}
    achievement_by_id = {achievement['id']: achievement for achievement in achievements}
    gifts = [
        {**gift, 'unlocked': achievement_by_id[gift['achievementId']]['unlocked'], 'claimed': gift['id'] in claimed_gifts}
        for gift in GIFT_CATALOG
    ]
    today = datetime.utcnow().date().isoformat()
    daily_claimed = DailyGiftClaim.query.filter_by(user_id=user_id, claim_day=today).first() is not None
    purchases = GemPurchase.query.filter_by(user_id=user_id).all()
    owned_house_items = [purchase.item_id for purchase in purchases]
    completed_house_steps = {record.step for record in HouseConstructionStep.query.filter_by(user_id=user_id).all()}
    house_level = 0
    while house_level + 1 in completed_house_steps:
        house_level += 1
    level_reward = LevelGemReward.query.filter_by(user_id=user_id, level=progress.current_level).first()
    return jsonify({
        'user': user.to_public_dict(),
        'progress': progress.to_dict(),
        'stats': {
            'totalGames': user.total_games or 0,
            'highestScore': user.highest_score or 0,
            'totalScore': sum(game.score for game in games),
            'totalFruitsSliced': sliced,
            'highestCombo': best_combo,
            'currentLevel': progress.current_level,
            'levelsCompleted': completed_levels,
            'totalPlayTime': sum(game.duration for game in games)
        },
        'achievements': achievements,
        'gifts': gifts,
        'gems': wallet_balance(user_id),
        'wallet': wallet_summary(user_id),
        'dailyGift': {'claimed': daily_claimed, 'gems': 10},
        'houseItems': owned_house_items,
        'houseLevel': house_level,
        'levelReward': ({'level': level_reward.level, 'gems': level_reward.gems, 'claimed': level_reward.claimed} if level_reward else None),
        'history': [game.to_dict() for game in games[:20]]
    }), 200


@app.get('/api/wallet')
@jwt_required()
def get_wallet():
    user_id = int(get_jwt_identity())
    return jsonify(wallet_summary(user_id)), 200


@app.get('/api/house')
@jwt_required()
def get_house():
    user_id = int(get_jwt_identity())
    owned = {purchase.item_id for purchase in GemPurchase.query.filter_by(user_id=user_id).all()}
    completed_steps = {item.step for item in HouseConstructionStep.query.filter_by(user_id=user_id).all()}
    step = 0
    while step + 1 in completed_steps:
        step += 1
    stages = [{**item, 'id': f"construction-step-{item['step']}", 'complete': item['step'] <= step, 'available': item['step'] == step + 1}
              for item in HOUSE_CONSTRUCTION_STEPS]
    return jsonify({'level': step, 'step': step, 'maxLevel': 100, 'maxStep': 100, 'progress': step, 'stages': stages,
                    'currentTask': stages[step] if step < 100 else None,
                    'ownedItems': sorted(owned), 'gems': wallet_balance(user_id)}), 200


@app.post('/api/gifts/daily')
@jwt_required()
def claim_daily_gift():
    user_id = int(get_jwt_identity())
    user = User.query.filter_by(id=user_id).with_for_update().first()
    if not user:
        return jsonify({'message': 'User not found'}), 404
    today = datetime.utcnow().date().isoformat()
    existing = DailyGiftClaim.query.filter_by(user_id=user_id, claim_day=today).first()
    if existing:
        return jsonify({'message': 'Today’s gift is already collected'}), 409
    DB.session.add(DailyGiftClaim(user_id=user_id, claim_day=today, gems=10))
    DB.session.add(GemTransaction(user_id=user_id, amount=10, kind='daily', description='Daily gift', source_key=f'daily-{today}'))
    try:
        DB.session.commit()
    except IntegrityError:
        DB.session.rollback()
        return jsonify({'message': 'Today’s gift is already collected'}), 409
    return jsonify({'gems': 10, 'balance': wallet_balance(user_id), 'wallet': wallet_summary(user_id), 'message': 'Daily gift collected!'}), 201


@app.post('/api/house/purchase')
@app.post('/api/house/build')
@jwt_required()
def purchase_house_item():
    user_id = int(get_jwt_identity())
    user = User.query.filter_by(id=user_id).with_for_update().first()
    if not user:
        return jsonify({'message': 'User not found'}), 404
    data = request.get_json(silent=True) or {}
    requested_step = data.get('step')
    item_id = str(data.get('itemId') or (f'construction-step-{requested_step}' if requested_step else ''))
    if item_id in HOUSE_BUILD_LEVELS:
        return jsonify({'message': 'Legacy six-stage building is retired. Continue with the 100-step construction plan.'}), 410
    if item_id in HOUSE_STEP_BY_ID:
        if not request.path.endswith('/build'):
            return jsonify({'message': 'Construction steps must use the build action'}), 400
        build = HOUSE_STEP_BY_ID[item_id]
        completed = {record.step for record in HouseConstructionStep.query.filter_by(user_id=user_id).all()}
        current_step = 0
        while current_step + 1 in completed:
            current_step += 1
        if build['step'] != current_step + 1:
            return jsonify({'message': f"Complete Step {current_step + 1} before starting this task"}), 409
        if build['step'] == 100 and current_step != 99:
            return jsonify({'message': 'Complete Steps 1–99 before the final handover'}), 409
        balance = wallet_balance(user_id)
        if balance < build['cost']:
            return jsonify({'message': f"Not enough gems. You need {build['cost'] - balance} more."}), 409
        DB.session.add(HouseConstructionStep(user_id=user_id, step=build['step'], cost=build['cost']))
        DB.session.add(GemPurchase(user_id=user_id, item_id=item_id, cost=build['cost']))
        DB.session.add(GemTransaction(user_id=user_id, amount=-build['cost'], kind='house', description=f"Step {build['step']}: {build['name']}", source_key=f"house-{item_id}"))
        try:
            DB.session.commit()
        except IntegrityError:
            DB.session.rollback()
            return jsonify({'message': 'This construction step was already completed'}), 409
        return jsonify({'step': build['step'], 'item': build, 'gems': wallet_balance(user_id), 'wallet': wallet_summary(user_id)}), 201
    item = next((entry for entry in HOUSE_CATALOG if entry['id'] == item_id), None)
    if not item:
        return jsonify({'message': 'House item not found'}), 404
    if GemPurchase.query.filter_by(user_id=user_id, item_id=item_id).first():
        return jsonify({'message': 'You already own this house item'}), 409
    if request.path.endswith('/build'):
        return jsonify({'message': 'Choose the next construction stage'}), 400
    balance = wallet_balance(user_id)
    if balance < item['cost']:
        return jsonify({'message': f'Not enough gems. You need {item["cost"] - balance} more.'}), 409
    DB.session.add(GemPurchase(user_id=user_id, item_id=item_id, cost=item['cost']))
    DB.session.add(GemTransaction(user_id=user_id, amount=-item['cost'], kind='house', description=item['name'], source_key=f'house-{item_id}'))
    try:
        DB.session.commit()
    except IntegrityError:
        DB.session.rollback()
        return jsonify({'message': 'This house item was already purchased'}), 409
    return jsonify({'item': item, 'gems': wallet_balance(user_id), 'wallet': wallet_summary(user_id)}), 201


def live_room_dict(room):
    owner = User.query.get(room.owner_id)
    return {'id': room.id, 'title': room.title, 'host': owner.name if owner else 'Player',
            'ownerId': room.owner_id, 'createdAt': room.created_at.isoformat()}


@app.get('/api/live/rooms')
@jwt_required()
def list_live_rooms():
    rooms = LiveRoom.query.filter_by(active=True).order_by(LiveRoom.created_at.desc()).limit(30).all()
    return jsonify({'rooms': [live_room_dict(room) for room in rooms]}), 200


@app.post('/api/live/rooms')
@jwt_required()
def create_live_room():
    user_id = int(get_jwt_identity())
    data = request.get_json(silent=True) or {}
    title = str(data.get('title') or 'Live gameplay').strip()[:80] or 'Live gameplay'
    LiveRoom.query.filter_by(owner_id=user_id, active=True).update({'active': False})
    room = LiveRoom(owner_id=user_id, title=title)
    DB.session.add(room)
    DB.session.commit()
    return jsonify({'room': live_room_dict(room)}), 201


@app.post('/api/live/rooms/<int:room_id>/join')
@jwt_required()
def join_live_room(room_id):
    user_id = int(get_jwt_identity())
    room = LiveRoom.query.filter_by(id=room_id, active=True).first()
    if not room:
        return jsonify({'message': 'This live room has ended'}), 404
    if room.owner_id == user_id:
        return jsonify({'message': 'You are already broadcasting this room'}), 409
    viewer = LiveViewer.query.filter_by(room_id=room_id, user_id=user_id).first()
    if not viewer:
        viewer = LiveViewer(room_id=room_id, user_id=user_id)
        DB.session.add(viewer)
        DB.session.commit()
    return jsonify({'viewerId': viewer.id}), 200


@app.get('/api/live/rooms/<int:room_id>/viewers')
@jwt_required()
def list_live_viewers(room_id):
    user_id = int(get_jwt_identity())
    room = LiveRoom.query.filter_by(id=room_id, owner_id=user_id, active=True).first()
    if not room:
        return jsonify({'message': 'Live room not found'}), 404
    viewers = LiveViewer.query.filter_by(room_id=room_id).order_by(LiveViewer.id).all()
    return jsonify({'viewers': [{'id': viewer.id, 'name': User.query.get(viewer.user_id).name} for viewer in viewers]}), 200


@app.route('/api/live/rooms/<int:room_id>/signals', methods=['GET', 'POST'])
@jwt_required()
def live_room_signals(room_id):
    user_id = int(get_jwt_identity())
    room = LiveRoom.query.filter_by(id=room_id).first()
    if not room:
        return jsonify({'message': 'Live room not found'}), 404
    if request.method == 'POST':
        data = request.get_json(silent=True) or {}
        viewer_id = data.get('viewerId')
        role = data.get('role')
        viewer = LiveViewer.query.filter_by(id=viewer_id, room_id=room_id).first()
        if not viewer or role not in ('host', 'viewer') or (role == 'host' and room.owner_id != user_id) or (role == 'viewer' and viewer.user_id != user_id):
            return jsonify({'message': 'You cannot send signals to this live room'}), 403
        payload = data.get('payload')
        if not isinstance(payload, dict):
            return jsonify({'message': 'Signal payload is invalid'}), 400
        signal = LiveSignal(room_id=room_id, viewer_id=viewer.id, sender_role=role, payload=json.dumps(payload))
        DB.session.add(signal)
        DB.session.commit()
        return jsonify({'id': signal.id}), 201
    viewer_id = request.args.get('viewerId', type=int)
    after = request.args.get('after', default=0, type=int)
    viewer = LiveViewer.query.filter_by(id=viewer_id, room_id=room_id).first()
    if not viewer or user_id not in (room.owner_id, viewer.user_id):
        return jsonify({'message': 'You cannot read signals for this live room'}), 403
    signals = LiveSignal.query.filter(LiveSignal.room_id == room_id, LiveSignal.viewer_id == viewer_id,
        LiveSignal.id > after, LiveSignal.sender_role == ('viewer' if user_id == room.owner_id else 'host')).order_by(LiveSignal.id).limit(100).all()
    return jsonify({'signals': [{'id': signal.id, 'payload': json.loads(signal.payload)} for signal in signals]}), 200


@app.post('/api/live/rooms/<int:room_id>/end')
@jwt_required()
def end_live_room(room_id):
    user_id = int(get_jwt_identity())
    room = LiveRoom.query.filter_by(id=room_id, owner_id=user_id, active=True).first()
    if not room:
        return jsonify({'message': 'Live room not found'}), 404
    room.active = False
    LiveSignal.query.filter_by(room_id=room_id).delete(synchronize_session=False)
    LiveViewer.query.filter_by(room_id=room_id).delete(synchronize_session=False)
    DB.session.commit()
    return jsonify({'ok': True}), 200


@app.post('/api/live/rooms/<int:room_id>/leave')
@jwt_required()
def leave_live_room(room_id):
    user_id = int(get_jwt_identity())
    viewer = LiveViewer.query.filter_by(room_id=room_id, user_id=user_id).first()
    if viewer:
        LiveSignal.query.filter_by(viewer_id=viewer.id).delete(synchronize_session=False)
        DB.session.delete(viewer)
        DB.session.commit()
    return jsonify({'ok': True}), 200


@app.post('/api/gifts/claim')
@jwt_required()
def claim_gift():
    data = request.get_json(silent=True) or {}
    user_id = int(get_jwt_identity())
    User.query.filter_by(id=user_id).with_for_update().first()
    gift = next((item for item in GIFT_CATALOG if item['id'] == data.get('giftId')), None)
    if gift is None:
        return jsonify({'message': 'Gift not found'}), 404
    existing = GiftClaim.query.filter_by(user_id=user_id, gift_id=gift['id']).first()
    if existing:
        return jsonify({'message': 'Gift already claimed'}), 409
    user = User.query.get(user_id)
    if not user:
        return jsonify({'message': 'User not found'}), 404
    progress = get_or_create_progress(user_id)
    games = GameResult.query.filter_by(user_id=user_id).all()
    unlocked = {item['id']: item['unlocked'] for item in get_achievement_state(user, progress, games)}
    if not unlocked.get(gift['achievementId']):
        return jsonify({'message': 'Unlock the matching achievement first'}), 403
    claim = GiftClaim(user_id=user_id, gift_id=gift['id'], gems=gift['gems'])
    DB.session.add(claim)
    DB.session.add(GemTransaction(user_id=user_id, amount=gift['gems'], kind='gift', description=gift['name'], source_key=f'gift-{gift["id"]}'))
    try:
        DB.session.commit()
    except IntegrityError:
        DB.session.rollback()
        return jsonify({'message': 'Gift already claimed'}), 409
    return jsonify({'gift': gift, 'gems': wallet_balance(user_id), 'wallet': wallet_summary(user_id)}), 201


@app.get('/api/challenges')
@jwt_required()
def list_friend_challenges():
    user_id = int(get_jwt_identity())
    challenges = FriendChallenge.query.filter(
        or_(FriendChallenge.creator_id == user_id, FriendChallenge.opponent_id == user_id)
    ).order_by(FriendChallenge.created_at.desc()).limit(50).all()
    return jsonify({'challenges': [challenge_to_dict(item, user_id) for item in challenges]}), 200


@app.post('/api/challenges')
@jwt_required()
def create_friend_challenge():
    user_id = int(get_jwt_identity())
    code = secrets.token_hex(4).upper()
    while FriendChallenge.query.filter_by(code=code).first():
        code = secrets.token_hex(4).upper()
    challenge = FriendChallenge(code=code, creator_id=user_id, status='waiting')
    DB.session.add(challenge)
    DB.session.commit()
    return jsonify({'challenge': challenge_to_dict(challenge, user_id)}), 201


@app.post('/api/challenges/join')
@jwt_required()
def join_friend_challenge():
    data = request.get_json(silent=True) or {}
    code = str(data.get('code') or '').strip().upper()
    if not code:
        return jsonify({'message': 'Enter a challenge code'}), 400
    challenge = FriendChallenge.query.filter_by(code=code).first()
    if not challenge:
        return jsonify({'message': 'Challenge code not found'}), 404
    user_id = int(get_jwt_identity())
    if challenge.creator_id == user_id:
        return jsonify({'message': 'You cannot join your own challenge'}), 409
    if challenge.opponent_id and challenge.opponent_id != user_id:
        return jsonify({'message': 'This challenge already has two players'}), 409
    if challenge.status == 'completed':
        return jsonify({'message': 'This challenge is already complete'}), 409
    challenge.opponent_id = user_id
    challenge.status = 'active'
    DB.session.commit()
    return jsonify({'challenge': challenge_to_dict(challenge, user_id)}), 200


def get_or_create_progress(user_id):
    progress = PlayerProgress.query.filter_by(user_id=user_id).first()
    if progress is None:
        progress = PlayerProgress(user_id=user_id)
        DB.session.add(progress)
        DB.session.commit()
    return progress


@app.get('/api/progress')
@jwt_required()
def get_player_progress():
    user_id = int(get_jwt_identity())
    progress = get_or_create_progress(user_id)
    return jsonify({'progress': progress.to_dict(), 'levels': LEVEL_CONFIG}), 200


@app.put('/api/progress')
@jwt_required()
def save_player_progress():
    data = request.get_json(silent=True) or {}
    user_id = int(get_jwt_identity())
    progress = get_or_create_progress(user_id)
    current_level = data.get('currentLevel')

    if not isinstance(current_level, int) or current_level < 1 or current_level > MAX_LEVEL:
        return jsonify({'message': 'Current level is invalid'}), 400

    if current_level != progress.current_level:
        if not progress.level_complete or current_level != min(progress.unlocked_level, MAX_LEVEL):
            return jsonify({'message': 'Complete the current level before advancing'}), 409
        progress.current_level = current_level
        progress.level_score = 0
        progress.fruits_sliced = 0
        progress.level_complete = False
    else:
        level_score = data.get('levelScore', progress.level_score)
        fruits_sliced = data.get('fruitsSliced', progress.fruits_sliced)
        if not isinstance(level_score, int) or not isinstance(fruits_sliced, int) or level_score < 0 or fruits_sliced < 0:
            return jsonify({'message': 'Level progress is invalid'}), 400
        progress.level_score = max(progress.level_score, level_score)
        progress.fruits_sliced = max(progress.fruits_sliced, fruits_sliced)

    DB.session.commit()
    return jsonify({'progress': progress.to_dict()}), 200


@app.post('/api/progress/complete')
@jwt_required()
def complete_player_level():
    data = request.get_json(silent=True) or {}
    user_id = int(get_jwt_identity())
    User.query.filter_by(id=user_id).with_for_update().first()
    progress = PlayerProgress.query.filter_by(user_id=user_id).with_for_update().first() or get_or_create_progress(user_id)
    level = data.get('level')
    level_score = data.get('levelScore')
    fruits_sliced = data.get('fruitsSliced', 0)
    session_id = data.get('sessionId')

    if not isinstance(level, int) or level < 1 or level > MAX_LEVEL or level != progress.current_level:
        return jsonify({'message': 'Level does not match saved progress'}), 409
    if not isinstance(session_id, str) or not session_id:
        return jsonify({'message': 'Game session id is required'}), 400
    session = GameSession.query.filter_by(session_id=session_id).with_for_update().first()
    if not session or session.user_id != user_id or session.level != level:
        return jsonify({'message': 'A valid game session for this level is required'}), 403
    if session.status not in ('active', 'level_complete'):
        return jsonify({'message': 'This game session cannot complete another level'}), 409
    if not isinstance(level_score, int) or not isinstance(fruits_sliced, int) or level_score < 0 or fruits_sliced < 0:
        return jsonify({'message': 'Level result is invalid'}), 400
    config = LEVEL_CONFIG[level - 1]
    saved_score = max(progress.level_score, level_score)
    saved_fruits = max(progress.fruits_sliced, fruits_sliced)
    if saved_score < config['targetScore'] or saved_fruits < config.get('targetFruits', 0):
        return jsonify({'message': 'The level score and fruit targets have not both been reached'}), 409

    progress.level_score = saved_score
    progress.fruits_sliced = saved_fruits
    progress.level_complete = True
    progress.unlocked_level = min(MAX_LEVEL, max(progress.unlocked_level, level + 1))
    session.status = 'level_complete'
    reward = LevelGemReward.query.filter_by(user_id=user_id, level=level).with_for_update().first()
    if reward is None:
        reward = LevelGemReward(user_id=user_id, level=level, gems=config.get('gemReward', 50 + (level - 1) * 25), claimed=False)
        DB.session.add(reward)
    DB.session.commit()
    return jsonify({'progress': progress.to_dict(), 'reward': {'level': level, 'gems': reward.gems, 'claimed': reward.claimed}, 'wallet': wallet_summary(user_id)}), 200


@app.post('/api/rewards/claim')
@jwt_required()
def claim_level_reward():
    data = request.get_json(silent=True) or {}
    user_id = int(get_jwt_identity())
    User.query.filter_by(id=user_id).with_for_update().first()
    level = data.get('level')
    if not isinstance(level, int) or level < 1 or level > MAX_LEVEL:
        return jsonify({'message': 'Reward level is invalid'}), 400
    progress = PlayerProgress.query.filter_by(user_id=user_id).with_for_update().first()
    reward = LevelGemReward.query.filter_by(user_id=user_id, level=level).with_for_update().first()
    if not progress or not reward or level > progress.unlocked_level or (level == progress.current_level and not progress.level_complete):
        return jsonify({'message': 'Complete this level before claiming its reward'}), 409
    if reward.claimed:
        return jsonify({'message': 'This level reward has already been claimed', 'reward': {'level': level, 'gems': reward.gems, 'claimed': True}, 'wallet': wallet_summary(user_id)}), 409
    reward.claimed = True
    reward.claimed_at = datetime.utcnow()
    DB.session.add(GemTransaction(user_id=user_id, amount=reward.gems, kind='level_reward', description=f'Level {level} reward', source_key=f'level-reward-{level}'))
    try:
        DB.session.commit()
    except IntegrityError:
        DB.session.rollback()
        return jsonify({'message': 'This level reward has already been claimed'}), 409
    return jsonify({'reward': {'level': level, 'gems': reward.gems, 'claimed': True}, 'wallet': wallet_summary(user_id)}), 201


@app.post('/api/games/start')
@jwt_required(optional=True)
def start_game():
    data = request.get_json(silent=True) or {}
    mode = data.get('mode', 'classic')
    user_id = get_jwt_identity()
    challenge_code = str(data.get('challengeCode') or '').strip().upper() or None
    if user_id:
        user_id = int(user_id)
        progress = get_or_create_progress(user_id)
        if data.get('level', progress.current_level) != progress.current_level:
            return jsonify({'message': 'Game level does not match saved progress'}), 409
        level = progress.current_level
    else:
        level = data.get('level', 1)
        if not isinstance(level, int) or level < 1 or level > MAX_LEVEL:
            return jsonify({'message': 'Game level is invalid'}), 400

    if challenge_code:
        if not user_id:
            return jsonify({'message': 'Sign in to play a friend challenge'}), 401
        challenge = FriendChallenge.query.filter_by(code=challenge_code).first()
        if not challenge or challenge.status != 'active':
            return jsonify({'message': 'This friend challenge is not active'}), 409
        if user_id not in (challenge.creator_id, challenge.opponent_id):
            return jsonify({'message': 'You are not a player in this challenge'}), 403
        existing_score = challenge.creator_score if user_id == challenge.creator_id else challenge.opponent_score
        if existing_score is not None:
            return jsonify({'message': 'Your challenge score has already been submitted'}), 409

    session_id = secrets.token_urlsafe(12)
    DB.session.add(GameSession(
        session_id=session_id,
        user_id=user_id,
        mode=mode,
        level=level,
        challenge_code=challenge_code,
        status='active'
    ))
    DB.session.commit()

    return jsonify({'session': {'id': session_id, 'mode': mode, 'status': 'active'}}), 201


@app.post('/api/games/complete')
@jwt_required(optional=True)
def complete_game():
    data = request.get_json(silent=True) or {}
    session_id = data.get('gameId') or data.get('session_id')
    if not session_id:
        return jsonify({'message': 'Game session id is required'}), 400

    session = GameSession.query.filter_by(session_id=session_id).first()
    if not session:
        return jsonify({'message': 'Unknown or expired game session'}), 404

    if session.status not in ('active', 'level_complete'):
        return jsonify({'message': 'Session already completed'}), 409

    score = int(data.get('score', 0))
    fruits_sliced = int(data.get('fruitsSliced', 0))
    bombs_hit = int(data.get('bombsHit', 0))
    max_combo = int(data.get('maxCombo', 0))
    duration = float(data.get('duration', 0))
    accuracy = float(data.get('accuracy', 0))

    if score < 0 or fruits_sliced < 0 or bombs_hit < 0 or duration < 0 or duration > 3600:
        return jsonify({'message': 'Game data is invalid'}), 400

    user_id = session.user_id
    identity = get_jwt_identity()
    if session.user_id and (not identity or int(identity) != session.user_id):
        return jsonify({'message': 'This game belongs to another player'}), 403
    if identity and user_id is None:
        user_id = int(identity)

    result = GameResult(
        user_id=user_id,
        session_id=session_id,
        level=session.level,
        mode=session.mode,
        score=score,
        fruits_sliced=fruits_sliced,
        bombs_hit=bombs_hit,
        max_combo=max_combo,
        duration=duration,
        accuracy=accuracy,
        status='completed'
    )
    DB.session.add(result)
    session.status = 'completed'

    if user_id:
        user = User.query.get(user_id)
        if user:
            user.highest_score = max(user.highest_score or 0, score)
            user.total_games += 1
            user.total_fruits_sliced += fruits_sliced
            user.highest_combo = max(user.highest_combo or 0, max_combo)
    if session.challenge_code and user_id:
        challenge = FriendChallenge.query.filter_by(code=session.challenge_code).first()
        if challenge and challenge.status == 'active':
            if challenge.creator_id == user_id and challenge.creator_score is None:
                challenge.creator_score = score
            elif challenge.opponent_id == user_id and challenge.opponent_score is None:
                challenge.opponent_score = score
            if challenge.creator_score is not None and challenge.opponent_score is not None:
                challenge.status = 'completed'
    DB.session.commit()

    challenge = FriendChallenge.query.filter_by(code=session.challenge_code).first() if session.challenge_code else None
    return jsonify({
        'game': result.to_dict(),
        'challenge': challenge_to_dict(challenge, user_id) if challenge else None
    }), 201


@app.get('/api/games/history')
@jwt_required()
def game_history():
    user_id = int(get_jwt_identity())
    entries = GameResult.query.filter_by(user_id=user_id).order_by(GameResult.created_at.desc()).all()
    return jsonify({'history': [entry.to_dict() for entry in entries]}), 200


@app.get('/api/leaderboard')
@jwt_required(optional=True)
def leaderboard():
    period = request.args.get('period', 'all')
    if period not in {'all', 'week', 'day'}:
        return jsonify({'message': 'Leaderboard period must be all, week, or day'}), 400
    query = GameResult.query.filter_by(status='completed')
    if period == 'week':
        query = query.filter(GameResult.created_at >= datetime.utcnow() - timedelta(days=7))
    elif period == 'day':
        query = query.filter(GameResult.created_at >= datetime.utcnow() - timedelta(days=1))

    best_by_player = {}
    for game in query.order_by(GameResult.score.desc(), GameResult.created_at.asc()).all():
        key = f'user-{game.user_id}' if game.user_id else f'guest-{game.session_id}'
        best_by_player.setdefault(key, game)

    rows = []
    for key, game in best_by_player.items():
        user = User.query.get(game.user_id) if game.user_id else None
        progress = PlayerProgress.query.filter_by(user_id=game.user_id).first() if user else None
        rows.append({
            'rank': 0,
            'name': user.name if user else 'Guest',
            'score': game.score,
            'mode': game.mode,
            'level': progress.current_level if progress else game.level,
            'fruitsSliced': user.total_fruits_sliced if user else game.fruits_sliced,
            'levelsCompleted': max(0, progress.unlocked_level - 1) if progress else 0,
            'createdAt': game.created_at.isoformat(),
            'playerKey': key
        })
    rows.sort(key=lambda row: (-row['score'], row['createdAt']))
    for index, row in enumerate(rows, start=1):
        row['rank'] = index
    identity = get_jwt_identity()
    current_rank = next((row['rank'] for row in rows if identity and row['playerKey'] == f'user-{identity}'), None)
    for row in rows:
        row.pop('playerKey', None)
    return jsonify({'leaderboard': rows[:100], 'period': period, 'currentPlayerRank': current_rank}), 200


@app.get('/api/leaderboard/me')
@jwt_required()
def my_leaderboard():
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user:
        return jsonify({'message': 'User not found'}), 404

    user_games = GameResult.query.filter_by(user_id=user_id).all()
    best_score = max((game.score for game in user_games), default=0)
    leaderboard_rows = GameResult.query.filter_by(status='completed').order_by(GameResult.score.desc()).all()
    position = None
    for index, game in enumerate(leaderboard_rows, start=1):
        if game.user_id == user_id:
            position = index
            break

    progress = PlayerProgress.query.filter_by(user_id=user_id).first()
    return jsonify({
        'name': user.name,
        'bestScore': best_score,
        'position': position,
        'totalGames': len(user_games),
        'currentLevel': progress.current_level if progress else 1,
        'levelsCompleted': max(0, progress.unlocked_level - 1) if progress else 0,
        'totalFruitsSliced': user.total_fruits_sliced or 0
    })


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=int(os.environ.get('PORT', 5000)))
